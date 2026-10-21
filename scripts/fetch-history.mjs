// Pulls prior The League II seasons from Fantrax + NBA game logs, then writes
// compact per-season files under data/history/ for the player pages.
//
// Run with: npm run fetch-history
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.resolve(process.cwd(), "data/history");
const CURRENT_PLAYERS = path.resolve(process.cwd(), "data/players.json");
const FANTRAX = "https://www.fantrax.com/fxea/general";

const HISTORY_LEAGUES = [
  { seasonYear: 2025, leagueId: "gxsj9v2rmasp79bn" },
  { seasonYear: 2024, leagueId: "mp1mk7uvm1wpjzzy" },
  { seasonYear: 2023, leagueId: "pjk1j1yvlmshtwjz" },
  { seasonYear: 2022, leagueId: "j39mgjepl772iy46" },
];

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

const COLS = ["date", "gameId", "team", "matchup", "min", "pts", "reb", "ast", "stl", "blk", "tov", "fg3m"];

function nbaSeason(year) {
  return `${year}-${String(year + 1).slice(-2)}`;
}

function normalizeName(name) {
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

function flipName(name) {
  const [last, first] = String(name).split(",").map((s) => s.trim());
  return first ? `${first} ${last}` : name;
}

const TRICODE = { GS: "GSW", NO: "NOP", NY: "NYK", SA: "SAS", PHO: "PHX", WSH: "WAS", UTAH: "UTA" };
const nbaTricode = (code) => TRICODE[code] ?? code;

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function nba(endpoint, params) {
  const url = new URL(`https://stats.nba.com/stats/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: NBA_HEADERS, signal: AbortSignal.timeout(45_000) });
  if (!res.ok) throw new Error(`${endpoint} ${JSON.stringify(params)} -> HTTP ${res.status}`);
  return res.json();
}

function parseMinutes(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v);
  const iso = /^PT(?:(\d+)M)?(?:([\d.]+)S)?$/.exec(s);
  if (iso) return Number(iso[1] ?? 0) + Number(iso[2] ?? 0) / 60;
  const clock = /^(\d+):(\d+)$/.exec(s);
  if (clock) return Number(clock[1]) + Number(clock[2]) / 60;
  return Number(s) || 0;
}

function buildMatcher(players) {
  const byName = new Map();
  const byLastAndTeam = new Map();
  const push = (map, key, p) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  };
  for (const p of Object.values(players)) {
    push(byName, normalizeName(flipName(p.name)), p);
    push(byLastAndTeam, `${normalizeName(p.name.split(",")[0])}|${nbaTricode(p.nbaTeam)}`, p);
  }
  return (nbaName, nbaTeam) => {
    const full = normalizeName(nbaName);
    const candidates = byName.get(full);
    if (candidates?.length === 1) return candidates[0].id;
    if (candidates?.length > 1) {
      return (candidates.find((c) => nbaTricode(c.nbaTeam) === nbaTeam) ?? candidates[0]).id;
    }
    const last = full.split(" ").pop() ?? "";
    const fallback = byLastAndTeam.get(`${last}|${nbaTeam}`);
    if (fallback?.length === 1) return fallback[0].id;
    const sameInitial = fallback?.filter((c) => normalizeName(flipName(c.name))[0] === full[0]);
    return sameInitial?.length === 1 ? sameInitial[0].id : null;
  };
}

function parseScoring(league) {
  const configs = league.scoringSystem?.scoringCategorySettings?.[0]?.configs ?? [];
  return configs
    .map((c) => ({
      code: c.scoringCategory.code,
      name: c.scoringCategory.name,
      shortName: c.scoringCategory.shortName,
      points: c.points,
    }))
    .filter((c) => c.points != null);
}

async function fetchSeasonLogs(season, seasonType) {
  const json = await nba("playergamelogs", { Season: season, SeasonType: seasonType, LeagueID: "00" });
  const rs = json.resultSets?.[0];
  if (!rs) return [];
  const idx = Object.fromEntries(rs.headers.map((h, i) => [h, i]));
  const n = (row, key) => Number(row[idx[key]] ?? 0);
  return rs.rowSet.map((row) => ({
    gameId: String(row[idx.GAME_ID]),
    date: String(row[idx.GAME_DATE]).slice(0, 10),
    name: String(row[idx.PLAYER_NAME]),
    team: String(row[idx.TEAM_ABBREVIATION]),
    matchup: String(row[idx.MATCHUP]),
    min: Math.round(parseMinutes(row[idx.MIN]) * 10) / 10,
    pts: n(row, "PTS"),
    reb: n(row, "REB"),
    ast: n(row, "AST"),
    stl: n(row, "STL"),
    blk: n(row, "BLK"),
    tov: n(row, "TOV"),
    fg3m: n(row, "FG3M"),
  }));
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const current = JSON.parse(await readFile(CURRENT_PLAYERS, "utf8"));
  const allPlayers = await getJson(`${FANTRAX}/getPlayerIds?sport=NBA`);
  // Prefer current-pool identities; fall back to the global Fantrax directory
  // so name matches still resolve to the same IDs the site uses today.
  const matcher = buildMatcher({ ...allPlayers, ...current });

  const index = [];

  for (const { seasonYear, leagueId } of HISTORY_LEAGUES) {
    const season = nbaSeason(seasonYear);
    console.log(`\n=== ${season} (${leagueId}) ===`);
    const league = await getJson(`${FANTRAX}/getLeagueInfo?leagueId=${leagueId}`);
    const [standings, draft] = await Promise.all([
      getJson(`${FANTRAX}/getStandings?leagueId=${leagueId}`).catch((e) => {
        console.warn(`standings failed: ${e.message}`);
        return null;
      }),
      getJson(`${FANTRAX}/getDraftResults?leagueId=${leagueId}`).catch((e) => {
        console.warn(`draft failed: ${e.message}`);
        return null;
      }),
    ]);

    const [reg, playoffs] = await Promise.all([
      fetchSeasonLogs(season, "Regular Season"),
      fetchSeasonLogs(season, "Playoffs").catch((e) => {
        console.warn(`playoffs ${season} failed: ${e.message}`);
        return [];
      }),
    ]);
    const raw = [...reg, ...playoffs];
    console.log(`NBA rows ${raw.length} (regular ${reg.length}, playoffs ${playoffs.length})`);

    const players = {};
    let matched = 0;
    let skipped = 0;
    for (const row of raw) {
      const fantraxId = matcher(row.name, row.team);
      if (!fantraxId || !current[fantraxId]) {
        skipped++;
        continue;
      }
      matched++;
      (players[fantraxId] ??= []).push([
        row.date,
        row.gameId,
        row.team,
        row.matchup,
        row.min,
        row.pts,
        row.reb,
        row.ast,
        row.stl,
        row.blk,
        row.tov,
        row.fg3m,
      ]);
    }
    for (const rows of Object.values(players)) {
      rows.sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
    }
    console.log(`matched ${matched} logs for ${Object.keys(players).length} current-pool players (skipped ${skipped})`);

    const payload = { season, seasonYear, leagueId, cols: COLS, players };
    await writeFile(path.join(OUT_DIR, `${season}.json`), JSON.stringify(payload));

    const champ = standings?.standingsTable?.rows?.[0];
    index.push({
      season,
      seasonYear,
      leagueId,
      leagueName: league.leagueName,
      startDate: league.startDate,
      endDate: league.endDate,
      scoring: parseScoring(league),
      teams: Object.values(league.teamInfo ?? {}).map((t) => ({ id: t.id, name: t.name })),
      champion: champ ? { teamId: champ.teamId, teamName: champ.teamName, points: champ.points } : null,
      draftPicks: (draft?.draftPicks ?? []).map((p) => ({
        playerId: p.playerId,
        teamId: p.teamId,
        round: p.round,
        pick: p.pick,
        pickInRound: p.pickInRound,
        time: p.time,
      })),
      playerCount: Object.keys(players).length,
      logCount: matched,
    });
  }

  await writeFile(path.join(OUT_DIR, "index.json"), JSON.stringify({ fetchedAt: new Date().toISOString(), seasons: index }, null, 2) + "\n");
  console.log(`\nWrote ${index.length} seasons to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
