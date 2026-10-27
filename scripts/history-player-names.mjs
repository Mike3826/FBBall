// Shared name lookup for retired Fantrax players that getPlayerIds no longer
// includes. Draft recaps, other-season rosters, and the transaction log still
// have names (Kyle Lowry, Chris Paul, …).
import { readFile } from "node:fs/promises";
import path from "node:path";

export function usableTeam(team) {
  return Boolean(team && team !== "(N/A)");
}

export function usablePos(pos) {
  return Boolean(pos && pos !== "Flx");
}

export function remember(index, id, info) {
  if (!id || !info?.name || info.name === "Unknown") return;
  const prev = index.get(id);
  if (!prev) {
    index.set(id, {
      name: info.name,
      nbaTeam: info.nbaTeam ?? info.team ?? "",
      position: info.position ?? info.pos ?? "",
    });
    return;
  }
  if (!usableTeam(prev.nbaTeam) && usableTeam(info.nbaTeam ?? info.team)) {
    prev.nbaTeam = info.nbaTeam ?? info.team;
  }
  if (!usablePos(prev.position) && usablePos(info.position ?? info.pos)) {
    prev.position = info.position ?? info.pos;
  }
}

export function applyKnown(player, known) {
  if (!known) return player;
  if (!player.name || player.name === "Unknown") player.name = known.name;
  if (!usableTeam(player.nbaTeam) && usableTeam(known.nbaTeam)) player.nbaTeam = known.nbaTeam;
  if (!usablePos(player.position) && usablePos(known.position)) {
    player.position = known.position;
    if (player.eligiblePos !== undefined && !usablePos(player.eligiblePos)) player.eligiblePos = known.position;
  }
  return player;
}

export function indexFromLeague(index, league) {
  for (const season of league.seasons ?? []) {
    for (const p of season.draft?.picks ?? []) remember(index, p.playerId, p);
    for (const roster of Object.values(season.rosters ?? {})) {
      for (const p of roster.players ?? []) remember(index, p.id, p);
    }
  }
  return index;
}

export function fillLeagueUnknowns(league, extra = new Map()) {
  const index = new Map(extra);
  indexFromLeague(index, league);
  let filled = 0;
  for (const season of league.seasons ?? []) {
    for (const p of season.draft?.picks ?? []) {
      const before = p.name;
      applyKnown(p, index.get(p.playerId));
      if (before === "Unknown" && p.name !== "Unknown") filled++;
    }
    for (const roster of Object.values(season.rosters ?? {})) {
      for (const p of roster.players ?? []) {
        const before = p.name;
        applyKnown(p, index.get(p.id));
        if (before === "Unknown" && p.name !== "Unknown") filled++;
      }
    }
  }
  return filled;
}

export async function loadExtraNames(cwd = process.cwd()) {
  const index = new Map();
  try {
    const tx = JSON.parse(await readFile(path.join(cwd, "data/transactions.json"), "utf8"));
    for (const t of tx.transactions ?? []) {
      for (const m of t.moves ?? []) {
        remember(index, m.playerId, { name: m.playerName, nbaTeam: m.nbaTeam, position: m.pos });
      }
    }
  } catch {
    // transactions snapshot is optional
  }
  try {
    const league = JSON.parse(await readFile(path.join(cwd, "data/history/league.json"), "utf8"));
    indexFromLeague(index, league);
  } catch {
    // first history fetch has no snapshot yet
  }
  return index;
}
