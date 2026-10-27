// Fill "Unknown" history roster/draft names from drafts, other seasons, and
// the transaction log. Fantrax's public player list drops retired players.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fillLeagueUnknowns, loadExtraNames } from "./history-player-names.mjs";

const OUT = path.resolve(process.cwd(), "data/history/league.json");

async function main() {
  const league = JSON.parse(await readFile(OUT, "utf8"));
  const extra = await loadExtraNames();
  const filled = fillLeagueUnknowns(league, extra);
  let remaining = 0;
  for (const season of league.seasons ?? []) {
    remaining += (season.draft?.picks ?? []).filter((p) => p.name === "Unknown").length;
    remaining += Object.values(season.rosters ?? {}).flatMap((r) => r.players ?? []).filter((p) => p.name === "Unknown").length;
  }
  league.fetchedAt = new Date().toISOString();
  await writeFile(OUT, JSON.stringify(league, null, 2) + "\n");
  console.log(`Filled ${filled} Unknown names · ${remaining} remaining · wrote ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
