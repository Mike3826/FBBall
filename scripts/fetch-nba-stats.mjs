// Dumps completed NBA player game logs for the current season to
// data/season-logs.json. The site seeds Daily/Live/Season rankings from that
// file so finished slates do not have to be re-fetched on every request.
//
// Run with: npm run fetch-stats
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve(process.cwd(), "data");

const NBA_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nba.com/",
  Origin: "https://www.nba.com",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true",
};

async function nba(endpoint, params) {
  const url = new URL(`https://stats.nba.com/stats/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: NBA_HEADERS, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${endpoint} -> HTTP ${res.status}`);
  return res.json();
}

/** Today's date in US Eastern time as YYYY-MM-DD (NBA game dates are ET). */
function todayEt() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

/** Normalize a name for matching across data sources. */
export function normalizeName(name) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/-/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Fantrax "Last, First" -> "First Last". */
function flipName(name) {
  const [last, first] = name.split(",").map((s) => s.trim());
  return first ? `${first} ${last}` : name;
}

/** Fantrax and NBA use a few different tricodes. */
const TRICODE_ALIASES = {
  GS: "GSW",
  NO: "NOP",
  NY: "NYK",
  SA: "SAS",
  PHO: "PHX",
  WSH: "WAS",
  UTAH: "UTA",
  UT: "UTA",
};
function nbaTricode(fantraxCode) {
  return TRICODE_ALIASES[fantraxCode] ?? fantraxCode;
}

/** "PT34M12.00S" or "34:12" or 34.2 -> minutes as a number. */
function parseMinutes(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const iso = /^PT(?:(\d+)M)?(?:([\d.]+)S)?$/.exec(v);
  if (iso) return Number(iso[1] ?? 0) + Number(iso[2] ?? 0) / 60;
  const clock = /^(\d+):(\d+)$/.exec(v);
  if (clock) return Number(clock[1]) + Number(clock[2]) / 60;
  return Number(v) || 0;
}

function buildPlayerMatcher(players) {
  const byName = new Map();
  const byLastAndTeam = new Map();
  const push = (map, key, p) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  };
  for (const p of Object.values(players)) {
    push(byName, normalizeName(flipName(p.name)), p);
    const last = normalizeName(p.name.split(",")[0]);
    push(byLastAndTeam, `${last}|${nbaTricode(p.nbaTeam)}`, p);
  }
  return (nbaName, nbaTeam) => {
    const full = normalizeName(nbaName);
    const candidates = byName.get(full);
    if (candidates?.length === 1) return candidates[0].id;
    if (candidates?.length > 1) {
      const sameTeam = candidates.find((c) => nbaTricode(c.nbaTeam) === nbaTeam);
      return (sameTeam ?? candidates[0]).id;
    }
    // Fallback for nickname differences ("Ron" vs "Ronald"): unique last name on the same NBA team.
    const last = full.split(" ").pop();
    const fallback = byLastAndTeam.get(`${last}|${nbaTeam}`);
    if (fallback?.length === 1) return fallback[0].id;
    const sameInitial = fallback?.filter((c) => normalizeName(flipName(c.name))[0] === full[0]);
    return sameInitial?.length === 1 ? sameInitial[0].id : null;
  };
}

function logKey(l) {
  return `${l.date}|${normalizeName(l.name)}|${l.team}`;
}

function mergeLogRows(rows) {
  const map = new Map();
  for (const l of rows) {
    if (l.live) continue;
    map.set(logKey(l), l);
  }
  return [...map.values()];
}

async function fetchSeasonGameLogs(season) {
  const json = await nba("playergamelogs", { Season: season, SeasonType: "Regular Season", LeagueID: "00" });
  const rs = json.resultSets[0];
  const idx = Object.fromEntries(rs.headers.map((h, i) => [h, i]));
  return rs.rowSet.map((row) => ({
    gameId: row[idx.GAME_ID],
    date: String(row[idx.GAME_DATE]).slice(0, 10),
    nbaId: row[idx.PLAYER_ID],
    name: row[idx.PLAYER_NAME],
    team: row[idx.TEAM_ABBREVIATION],
    matchup: row[idx.MATCHUP],
    min: Math.round(parseMinutes(row[idx.MIN]) * 10) / 10,
    pts: row[idx.PTS] ?? 0,
    reb: row[idx.REB] ?? 0,
    ast: row[idx.AST] ?? 0,
    stl: row[idx.STL] ?? 0,
    blk: row[idx.BLK] ?? 0,
    tov: row[idx.TOV] ?? 0,
    fg3m: row[idx.FG3M] ?? 0,
    live: false,
  }));
}

function eachEtDate(startYmd, endYmd) {
  const dates = [];
  let cur = startYmd;
  while (cur <= endYmd) {
    dates.push(cur);
    const [y, m, d] = cur.split("-").map(Number);
    cur = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  }
  return dates;
}

function hasCompleteFinal(logs, game) {
  const teams = new Set(
    logs.filter((l) => l.date === game.date && !l.live && (l.team === game.home || l.team === game.away)).map((l) => l.team),
  );
  return teams.has(game.home) && teams.has(game.away);
}

function espnStat(keys, stats, key) {
  const i = keys.indexOf(key);
  if (i < 0) return 0;
  const raw = stats[i] ?? "0";
  if (raw.includes("-")) return Number(raw.split("-")[0]) || 0;
  return Number.parseFloat(raw) || 0;
}

async function fetchEspnScoreboard(date) {
  const ymd = date.replaceAll("-", "");
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${ymd}&limit=100`, {
    headers: { Accept: "application/json", "User-Agent": NBA_HEADERS["User-Agent"] },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`espn scoreboard ${date} -> HTTP ${res.status}`);
  const json = await res.json();
  return (json.events ?? []).map((event) => {
    const comps = event.competitions?.[0]?.competitors ?? [];
    const home = comps.find((c) => c.homeAway === "home");
    const away = comps.find((c) => c.homeAway === "away");
    const state = event.status?.type?.state ?? "pre";
    const status = state === "post" ? 3 : state === "in" ? 2 : 1;
    return {
      gameId: event.id,
      date,
      status,
      home: nbaTricode(home?.team?.abbreviation ?? ""),
      away: nbaTricode(away?.team?.abbreviation ?? ""),
    };
  });
}

async function fetchEspnBoxScore(game) {
  const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${game.gameId}`, {
    headers: { Accept: "application/json", "User-Agent": NBA_HEADERS["User-Agent"] },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`espn box ${game.gameId} -> HTTP ${res.status}`);
  const json = await res.json();
  const rows = [];
  for (const teamBlock of json.boxscore?.players ?? []) {
    const team = nbaTricode(teamBlock.team?.abbreviation ?? "");
    const opp = nbaTricode(team === game.home ? game.away : game.home);
    const isHome = team === game.home;
    const table = teamBlock.statistics?.[0];
    const keys = table?.keys ?? [];
    for (const row of table?.athletes ?? []) {
      if (row.didNotPlay || !row.stats?.length) continue;
      const min = espnStat(keys, row.stats, "minutes");
      const pts = espnStat(keys, row.stats, "points");
      if (!min && !pts) continue;
      rows.push({
        gameId: game.gameId,
        date: game.date,
        nbaId: Number(row.athlete?.id ?? 0),
        name: row.athlete?.displayName ?? "",
        team,
        matchup: `${team} ${isHome ? "vs." : "@"} ${opp}`,
        min: Math.round(min * 10) / 10,
        pts,
        reb: espnStat(keys, row.stats, "rebounds"),
        ast: espnStat(keys, row.stats, "assists"),
        stl: espnStat(keys, row.stats, "steals"),
        blk: espnStat(keys, row.stats, "blocks"),
        tov: espnStat(keys, row.stats, "turnovers"),
        fg3m: espnStat(keys, row.stats, "threePointFieldGoalsMade-threePointFieldGoalsAttempted"),
        live: game.status !== 3,
      });
    }
  }
  return rows;
}

async function backfillEspnFinals(logs, startDate, endDate) {
  let added = 0;
  for (const date of eachEtDate(startDate, endDate)) {
    let games = [];
    try {
      games = await fetchEspnScoreboard(date);
    } catch (err) {
      console.warn(`  ! ESPN scoreboard ${date}: ${err.message}`);
      continue;
    }
    const finals = games.filter((g) => g.status === 3 && !hasCompleteFinal(logs, g));
    if (!games.length) continue;
    console.log(`  ESPN ${date}: ${games.length} games, ${finals.length} missing finals`);
    for (const game of finals) {
      try {
        const rows = (await fetchEspnBoxScore(game)).filter((l) => !l.live);
        logs.push(...rows);
        added += rows.length;
        console.log(`    + ${game.away} @ ${game.home}: ${rows.length} players`);
      } catch (err) {
        console.warn(`    ! box ${game.away} @ ${game.home}: ${err.message}`);
      }
    }
  }
  return added;
}

async function fetchScoreboard(date) {
  const json = await nba("scoreboardv3", { GameDate: date, LeagueID: "00" });
  return (json.scoreboard?.games ?? []).map((g) => ({
    gameId: g.gameId,
    date,
    status: g.gameStatus, // 1 scheduled, 2 live, 3 final
    statusText: g.gameStatusText,
    home: g.homeTeam?.teamTricode,
    away: g.awayTeam?.teamTricode,
    homeScore: g.homeTeam?.score ?? 0,
    awayScore: g.awayTeam?.score ?? 0,
  }));
}

/**
 * Live box scores come from the NBA's CDN live-data feed; stats.nba.com's box
 * score endpoints stay empty until a game is final.
 */
async function fetchLiveBoxScore(game) {
  const res = await fetch(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${game.gameId}.json`, {
    headers: {
      "User-Agent": NBA_HEADERS["User-Agent"],
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://www.nba.com/",
      Origin: "https://www.nba.com",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`live boxscore -> HTTP ${res.status}`);
  const box = (await res.json()).game;
  const rows = [];
  for (const [side, opp] of [
    ["homeTeam", "awayTeam"],
    ["awayTeam", "homeTeam"],
  ]) {
    const team = box[side];
    const isHome = side === "homeTeam";
    for (const p of team.players ?? []) {
      const s = p.statistics ?? {};
      const min = parseMinutes(s.minutes);
      if (!min && !s.points) continue; // DNP
      rows.push({
        gameId: game.gameId,
        date: game.date,
        nbaId: p.personId,
        name: p.name ?? `${p.firstName} ${p.familyName}`,
        team: team.teamTricode,
        matchup: `${team.teamTricode} ${isHome ? "vs." : "@"} ${box[opp].teamTricode}`,
        min: Math.round(min * 10) / 10,
        pts: s.points ?? 0,
        reb: s.reboundsTotal ?? 0,
        ast: s.assists ?? 0,
        stl: s.steals ?? 0,
        blk: s.blocks ?? 0,
        tov: s.turnovers ?? 0,
        fg3m: s.threePointersMade ?? 0,
        live: box.gameStatus !== 3,
      });
    }
  }
  return rows;
}

async function main() {
  const league = JSON.parse(await readFile(path.join(DATA_DIR, "league.json"), "utf8"));
  const players = JSON.parse(await readFile(path.join(DATA_DIR, "players.json"), "utf8"));
  const season = `${league.seasonYear}-${String(league.seasonYear + 1).slice(-2)}`;
  const match = buildPlayerMatcher(players);

  console.log(`Fetching ${season} game logs...`);
  let logs = [];
  try {
    logs = await fetchSeasonGameLogs(season);
    console.log(`  ${logs.length} completed player-games from stats.nba.com`);
  } catch (err) {
    console.warn(`  ! stats.nba.com season logs failed: ${err.message}`);
  }

  const today = todayEt();
  const start = String(league.startDate ?? `${league.seasonYear}-10-20`).slice(0, 10);
  try {
    const added = await backfillEspnFinals(logs, start, today);
    if (added) console.log(`  + ${added} completed rows from ESPN`);
  } catch (err) {
    console.warn(`  ! ESPN backfill failed: ${err.message}`);
  }
  logs = mergeLogRows(logs);

  // Supplement with today's live/just-finished games that aren't in the logs yet.
  let games = [];
  try {
    games = await fetchScoreboard(today);
    const have = new Set(logs.map((l) => l.gameId));
    const pending = games.filter((g) => g.status >= 2 && !have.has(g.gameId));
    console.log(`  ${games.length} games today, ${pending.length} live/unlogged`);
    for (const g of pending) {
      try {
        const rows = await fetchLiveBoxScore(g);
        logs.push(...rows);
        console.log(`  + ${g.away} @ ${g.home} (${g.statusText.trim()}): ${rows.length} players`);
      } catch (err) {
        console.warn(`  ! box score failed for ${g.gameId}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`  ! scoreboard failed: ${err.message}`);
  }

  // Attach Fantrax IDs.
  let matched = 0;
  const unmatched = new Set();
  for (const l of logs) {
    l.fantraxId = match(l.name, l.team);
    if (l.fantraxId) matched++;
    else unmatched.add(`${l.name} (${l.team})`);
  }
  console.log(`  matched ${matched}/${logs.length} rows to Fantrax players`);
  if (unmatched.size) console.log(`  unmatched: ${[...unmatched].slice(0, 15).join(", ")}${unmatched.size > 15 ? ", …" : ""}`);

  logs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));

  const slim = logs
    .filter((l) => !l.live)
    .map((l) => ({
      gameId: l.gameId,
      date: l.date,
      nbaId: l.nbaId,
      name: l.name,
      team: nbaTricode(l.team),
      matchup: l.matchup,
      min: l.min,
      pts: l.pts,
      reb: l.reb,
      ast: l.ast,
      stl: l.stl,
      blk: l.blk,
      tov: l.tov,
      fg3m: l.fg3m,
      fantraxId: l.fantraxId ?? null,
    }));
  const out = { fetchedAt: new Date().toISOString(), season, logs: slim };
  await writeFile(path.join(DATA_DIR, "season-logs.json"), JSON.stringify(out) + "\n");
  const dates = [...new Set(slim.map((l) => l.date))].sort();
  console.log(`Wrote ${slim.length} completed rows (${dates[0] ?? "—"} – ${dates.at(-1) ?? "—"}) to data/season-logs.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
