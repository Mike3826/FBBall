// Re-pull end-of-season rosters at the last scoring period. Fantrax's default
// period for old leagues is an offseason leftover (e.g. 153) with emptied lineups.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const FANTRAX = "https://www.fantrax.com/fxea/general";
const OUT = path.resolve(process.cwd(), "data/history/league.json");

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const league = JSON.parse(await readFile(OUT, "utf8"));
  const allPlayers = await getJson(`${FANTRAX}/getPlayerIds?sport=NBA`);

  for (const season of league.seasons) {
    const info = await getJson(`${FANTRAX}/getLeagueInfo?leagueId=${season.leagueId}`);
    const lastPeriod = Math.max(0, ...(info.scoringPeriods ?? []).map((p) => p.number));
    const rosters = await getJson(
      `${FANTRAX}/getTeamRosters?leagueId=${season.leagueId}${lastPeriod ? `&period=${lastPeriod}` : ""}`,
    );
    const nameById = {};
    for (const roster of Object.values(season.rosters ?? {})) {
      for (const p of roster.players ?? []) nameById[p.id] = p;
    }
    const next = {};
    for (const [teamId, roster] of Object.entries(rosters.rosters ?? {})) {
      next[teamId] = {
        teamName: roster.teamName ?? season.rosters?.[teamId]?.teamName ?? teamId,
        players: (roster.rosterItems ?? []).map((item) => {
          const p = allPlayers[item.id];
          const prev = nameById[item.id];
          return {
            id: item.id,
            name: p?.name ?? prev?.name ?? "Unknown",
            nbaTeam: p?.team ?? prev?.nbaTeam ?? "",
            position: p?.position ?? prev?.position ?? "",
            eligiblePos: p?.position ?? prev?.eligiblePos ?? "",
            rosterPosition: item.position,
            status: item.status,
          };
        }),
      };
    }
    const byStatus = {};
    for (const r of Object.values(next)) {
      for (const p of r.players) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    }
    season.rosters = next;
    season.rosterPeriod = rosters.period ?? lastPeriod;
    console.log(`${season.season} period ${season.rosterPeriod} · ${Object.keys(next).length} teams ·`, byStatus);
  }

  league.fetchedAt = new Date().toISOString();
  await writeFile(OUT, JSON.stringify(league, null, 2) + "\n");
  console.log(`\nUpdated ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
