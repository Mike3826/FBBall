// Pulls league data from the Fantrax public API and writes it to /data as JSON.
// Run with: npm run fetch-data
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { toMondaySundayPeriods } from "../lib/scoring-weeks.mjs";

const LEAGUE_ID = process.env.FANTRAX_LEAGUE_ID ?? "r7yj6bpwmtswkp9p";
const BASE = "https://www.fantrax.com/fxea/general";
const OUT_DIR = path.resolve(process.cwd(), "data");

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`Fetching league ${LEAGUE_ID}...`);
  const [league, standings, rosters, draft, allPlayers] = await Promise.all([
    getJson(`${BASE}/getLeagueInfo?leagueId=${LEAGUE_ID}`),
    getJson(`${BASE}/getStandings?leagueId=${LEAGUE_ID}`),
    getJson(`${BASE}/getTeamRosters?leagueId=${LEAGUE_ID}`),
    getJson(`${BASE}/getDraftResults?leagueId=${LEAGUE_ID}`),
    getJson(`${BASE}/getPlayerIds?sport=NBA`),
  ]);

  // Only keep players that are in this league's player pool, merged with
  // league-specific eligibility/status info.
  const pool = league.playerInfo ?? {};
  const players = {};
  for (const [id, info] of Object.entries(pool)) {
    const p = allPlayers[id];
    players[id] = {
      id,
      name: p?.name ?? "Unknown",
      nbaTeam: p?.team ?? "(N/A)",
      position: p?.position ?? "",
      eligiblePos: info.eligiblePos ?? "",
      status: info.status ?? "",
      rotowireId: p?.rotowireId ?? null,
    };
  }

  const write = (name, data) =>
    writeFile(path.join(OUT_DIR, name), JSON.stringify(data, null, 2) + "\n");

  await Promise.all([
    write("league.json", {
      leagueId: LEAGUE_ID,
      leagueName: league.leagueName,
      seasonYear: league.seasonYear,
      startDate: league.startDate,
      endDate: league.endDate,
      draftType: league.draftType,
      scoringType: league.scoringSystem?.type,
      scoring: league.scoringSystem?.scoringCategorySettings?.[0]?.configs?.map((c) => ({
        code: c.scoringCategory.code,
        name: c.scoringCategory.name,
        shortName: c.scoringCategory.shortName,
        points: c.points,
      })) ?? [],
      rosterInfo: league.rosterInfo,
      playoffs: league.playoffs,
      teams: Object.values(league.teamInfo ?? {}),
      scoringPeriods: toMondaySundayPeriods(league.scoringPeriods),
      matchups: league.matchups,
    }),
    write("standings.json", standings),
    write("rosters.json", rosters),
    write("draft.json", draft),
    write("players.json", players),
  ]);

  console.log(`Wrote data for "${league.leagueName}" (${Object.keys(players).length} players) to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
