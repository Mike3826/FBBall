// Optional local dump of NBA player game logs. The running site does not read
// this file — live pages always fetch ESPN/NBA on request.
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
const TRICODE_ALIASES = { GS: "GSW", NO: "NOP", NY: "NYK", SA: "SAS", PHO: "PHX", UTA: "UTA", WAS: "WAS" };
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
  let logs = await fetchSeasonGameLogs(season);
  console.log(`  ${logs.length} completed player-games`);

  // Supplement with today's live/just-finished games that aren't in the logs yet.
  const today = todayEt();
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

  const out = { fetchedAt: new Date().toISOString(), season, today, games, logs };
  await writeFile(path.join(DATA_DIR, "gamelogs.json"), JSON.stringify(out) + "\n");
  console.log(`Wrote ${logs.length} rows to data/gamelogs.json`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
