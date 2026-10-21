// Pulls the league transaction history (trades, claims, adds, drops) from
// Fantrax's internal API. This endpoint requires a logged-in session, so you
// must supply your browser's Fantrax cookie:
//
//   1. Log in at https://www.fantrax.com in your browser.
//   2. Open DevTools -> Network, click any request to www.fantrax.com, and copy
//      the full value of the "Cookie" request header.
//   3. Put it in .env.local as:  FANTRAX_COOKIE="JSESSIONID=...; FX_RM=...; ..."
//
// Run with: npm run fetch-transactions
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");

async function loadDotEnv(file) {
  try {
    const text = await readFile(file, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // no .env.local — rely on real environment variables
  }
}

async function fantrax(leagueId, cookie, method, data = {}) {
  const res = await fetch(`https://www.fantrax.com/fxpa/req?leagueId=${leagueId}`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      Accept: "application/json",
      Cookie: cookie,
      Referer: `https://www.fantrax.com/fantasy/league/${leagueId}/transactions`,
      // Cloudflare's cf_clearance cookie is bound to the browser UA it was issued to.
      "User-Agent":
        process.env.FANTRAX_USER_AGENT ??
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
    body: JSON.stringify({ msgs: [{ method, data: { leagueId, ...data } }] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`${method} -> HTTP ${res.status}`);
  const json = await res.json();
  const code = json.pageError?.code ?? json.responses?.[0]?.pageError?.code;
  if (code === "WARNING_NOT_LOGGED_IN") {
    throw new Error("Fantrax says we're not logged in. Your FANTRAX_COOKIE is missing, expired, or incomplete.");
  }
  if (code === "NOT_MEMBER_OF_LEAGUE") throw new Error("This account is not a member of the league.");
  if (code) throw new Error(`Fantrax error ${code}: ${json.pageError?.text ?? ""}`);
  return json.responses?.[0]?.data ?? json;
}

/** "Mon Oct 20, 2026, 8:00PM" -> ISO string (Eastern time). */
function parseFantraxDate(text) {
  const m = /^\w{3}\s+(\w{3})\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(text?.trim() ?? "");
  if (!m) return null;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const month = months.indexOf(m[1].toLowerCase());
  let hour = Number(m[4]) % 12;
  if (m[6].toUpperCase() === "PM") hour += 12;
  // Build the timestamp as Eastern time. Determine the ET offset for that date via Intl.
  const guess = new Date(Date.UTC(Number(m[3]), month, Number(m[2]), hour, Number(m[5])));
  const etParts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(guess)
    .find((p) => p.type === "timeZoneName")?.value; // e.g. "GMT-4"
  const offsetHours = Number(/GMT([+-]\d+)/.exec(etParts ?? "")?.[1] ?? -5);
  return new Date(guess.getTime() - offsetHours * 3600_000).toISOString();
}

/**
 * Flatten a table row from getTransactionDetailsHistory into one move.
 * Cells are keyed (team, bid, date, week, ...). Within a txSet, Fantrax only
 * puts team/date on the first row (rowspan), so later rows inherit from it.
 */
const stripHtml = (s) => (s ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

function rowToMove(row, inherited, view) {
  const cells = Object.fromEntries((row.cells ?? []).filter((c) => c?.key).map((c) => [c.key, c]));
  const scorer = row.scorer?.scorerId ? row.scorer : null;
  const code = row.transactionCode ?? (view === "TRADE" ? "TRADE" : "");
  const action = code === "CLAIM" ? row.claimType || "CLAIM" : code;

  // Claim/drop rows use a "team" cell; trade rows use "from" -> "to" (the "to" team receives the asset).
  const teamCell = cells.to ?? cells.team;
  const teamId = teamCell?.teamId ?? row.teamId ?? inherited?.teamId ?? null;
  const teamName = teamCell?.content || inherited?.teamName || null;
  const dateText = cells.date?.content || inherited?.dateText || null;
  const week = cells.week?.content || inherited?.week || null;

  // Draft picks arrive as HTML display parts instead of a scorer.
  const pick = row.draftPickDisplayParts
    ? `${stripHtml(row.draftPickDisplayParts.year)} · ${stripHtml(row.draftPickDisplayParts.roundInfo)}`
    : null;

  const knownKeys = new Set(["team", "from", "to", "obj", "bid", "date", "week"]);
  const extra = Object.values(cells)
    .filter((c) => !knownKeys.has(c.key) && c.content)
    .map((c) => stripHtml(c.content));

  return {
    teamId,
    teamName,
    fromTeamId: cells.from?.teamId ?? null,
    fromTeamName: cells.from?.content || null,
    dateText,
    week,
    action, // TRADE | FA | WAIVER | CLAIM | DROP | ... (whatever Fantrax reports)
    actionLabel: row.transactionType ?? (action === "TRADE" ? "Trade" : action),
    playerId: scorer?.scorerId ?? null,
    playerName: scorer?.name ?? null,
    nbaTeam: scorer?.teamShortName ?? scorer?.teamName ?? null,
    pos: scorer?.posShortNames ?? null,
    bid: cells.bid?.content || null,
    note: scorer ? null : pick ?? (extra.join(" · ") || row.description || null),
    executed: row.executed ?? row.resultCode === "EXECUTED",
  };
}

function groupTransactions(rows, view) {
  const groups = new Map();
  for (const row of rows) {
    const id = row.txSetId ?? `${view}-${groups.size}`;
    if (!groups.has(id)) groups.set(id, []);
    const group = groups.get(id);
    group.push(rowToMove(row, group[0], view));
  }
  const transactions = [];
  for (const [id, moves] of groups) {
    const actions = new Set(moves.map((m) => m.action));
    const type = view === "TRADE" || actions.has("TRADE") ? "TRADE" : actions.size === 1 ? [...actions][0] : "MULTI";
    const teams = [...new Set(moves.map((m) => m.teamId).filter(Boolean))];
    const first = moves[0];
    transactions.push({
      id,
      date: parseFantraxDate(first.dateText) ?? null,
      dateText: first.dateText,
      week: first.week ? Number(first.week) || first.week : null,
      type,
      teams,
      moves: moves.map(({ dateText: _d, week: _w, ...m }) => m),
    });
  }
  return transactions;
}

function withSeason(transactions, season, leagueId) {
  return transactions.map((t) => ({
    ...t,
    id: `${season}:${t.id}`,
    season,
    leagueId,
  }));
}

async function fetchView(leagueId, cookie, view) {
  const rows = [];
  let raw = null;
  for (let page = 1, pages = 1; page <= pages; page++) {
    const data = await fantrax(leagueId, cookie, "getTransactionDetailsHistory", {
      view,
      maxResultsPerPage: "500",
      pageNumber: String(page),
    });
    raw ??= data;
    rows.push(...(data?.table?.rows ?? []));
    pages = data?.paginatedResultSet?.totalNumPages ?? 1;
  }
  return { rows, raw };
}

const LEAGUES = [
  { season: "2026-27", leagueId: process.env.FANTRAX_LEAGUE_ID ?? "r7yj6bpwmtswkp9p" },
  { season: "2025-26", leagueId: "gxsj9v2rmasp79bn" },
  { season: "2024-25", leagueId: "mp1mk7uvm1wpjzzy" },
  { season: "2023-24", leagueId: "pjk1j1yvlmshtwjz" },
  { season: "2022-23", leagueId: "j39mgjepl772iy46" },
];

async function main() {
  await loadDotEnv(path.resolve(process.cwd(), ".env.local"));
  const cookie = process.env.FANTRAX_COOKIE;
  if (!cookie) {
    console.error("FANTRAX_COOKIE is not set. See the comment at the top of scripts/fetch-fantrax-transactions.mjs.");
    process.exitCode = 2;
    return;
  }

  const raw = {};
  const transactions = [];
  for (const { season, leagueId } of LEAGUES) {
    console.log(`Fetching ${season} (${leagueId})...`);
    raw[season] = {};
    let seasonCount = 0;
    for (const view of ["TRADE", "CLAIM_DROP"]) {
      const { rows, raw: viewRaw } = await fetchView(leagueId, cookie, view);
      raw[season][view] = viewRaw;
      const parsed = withSeason(groupTransactions(rows, view), season, leagueId);
      transactions.push(...parsed);
      seasonCount += parsed.length;
      console.log(`  ${view}: ${rows.length} rows -> ${parsed.length} transactions`);
    }
    console.log(`  ${season} total: ${seasonCount}`);
  }
  await writeFile(path.join(DATA_DIR, "fantrax-transactions-raw.json"), JSON.stringify(raw, null, 2) + "\n");

  transactions.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const trades = transactions.filter((t) => t.type === "TRADE");
  console.log(`\nAll seasons: ${transactions.length} transactions (${trades.length} trades)`);

  const out = {
    fetchedAt: new Date().toISOString(),
    leagueId: LEAGUES[0].leagueId,
    seasons: LEAGUES.map((l) => l.season),
    transactions,
  };
  await writeFile(path.join(DATA_DIR, "transactions.json"), JSON.stringify(out, null, 2) + "\n");
  console.log("Wrote data/transactions.json (raw response saved to data/fantrax-transactions-raw.json)");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exitCode = 1;
});
