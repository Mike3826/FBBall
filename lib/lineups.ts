import {
  formatPlayerName,
  getMatchupsForPeriod,
  getRoster,
  isTeamSide,
  leagueInfo,
  type ScoringPeriod,
  type Team,
} from "@/lib/data";
import type { Stats } from "@/lib/stats";

export type Slot = "G" | "F" | "C";
export const SLOTS: Slot[] = ["G", "F", "C"];
/** How many players at each slot count toward a team's weekly score. */
export const LINEUP_SLOTS: Record<Slot, number> = { G: 6, F: 6, C: 3 };
export const SLOT_LABEL: Record<Slot, string> = { G: "Guards", F: "Forwards", C: "Centers" };

export type LineupPlayer = {
  id: string;
  name: string;
  nbaTeam: string;
  slot: Slot;
  eligiblePos: string;
  games: number;
  fp: number;
  /** Fantasy points from a game currently in progress (0 if none). */
  liveFp: number;
  live: boolean;
  playedToday: boolean;
  counting: boolean;
  rank: number; // 1-based within slot
};

export type TeamLineup = {
  team: Team;
  /** Weekly score from counting players only (6 G + 6 F + 3 C). */
  score: number;
  /** Weekly points from everyone on the roster. */
  rosterTotal: number;
  groups: Record<Slot, LineupPlayer[]>;
  liveCount: number;
  playedTodayCount: number;
  countingGames: number;
};

export type LiveMatchup = {
  away: TeamLineup | null;
  home: TeamLineup | null;
  label?: string; // "BYE" / "TBD"
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildTeamLineups(stats: Stats, period: ScoringPeriod): TeamLineup[] {
  const weekly = new Map(stats.periodLeaders(period).filter((t) => t.fantraxId).map((t) => [t.fantraxId!, t]));
  const today = new Map(stats.dailyLeaders(stats.meta.today).filter((l) => l.fantraxId).map((l) => [l.fantraxId!, l]));

  return leagueInfo.teams.map((team) => {
    const groups: Record<Slot, LineupPlayer[]> = { G: [], F: [], C: [] };
    for (const p of getRoster(team.id)) {
      const slot = (SLOTS.includes(p.rosterPosition as Slot) ? p.rosterPosition : p.eligiblePos.split(",")[0]) as Slot;
      const w = weekly.get(p.id);
      const t = today.get(p.id);
      groups[slot].push({
        id: p.id,
        name: formatPlayerName(p.name),
        nbaTeam: p.nbaTeam,
        slot,
        eligiblePos: p.eligiblePos,
        games: w?.games ?? 0,
        fp: w?.fp ?? 0,
        liveFp: t?.live ? t.fp : 0,
        live: Boolean(t?.live),
        playedToday: Boolean(t),
        counting: false,
        rank: 0,
      });
    }

    let score = 0;
    let rosterTotal = 0;
    let liveCount = 0;
    let playedTodayCount = 0;
    let countingGames = 0;
    for (const slot of SLOTS) {
      groups[slot].sort((a, b) => b.fp - a.fp || b.games - a.games || a.name.localeCompare(b.name));
      groups[slot].forEach((p, i) => {
        p.rank = i + 1;
        p.counting = i < LINEUP_SLOTS[slot];
        rosterTotal += p.fp;
        if (p.live) liveCount++;
        if (p.playedToday) playedTodayCount++;
        if (p.counting) {
          score += p.fp;
          countingGames += p.games;
        }
      });
    }

    return { team, score: r2(score), rosterTotal: r2(rosterTotal), groups, liveCount, playedTodayCount, countingGames };
  });
}

export function buildLiveMatchups(lineups: TeamLineup[], period: ScoringPeriod): LiveMatchup[] {
  const byId = new Map(lineups.map((l) => [l.team.id, l]));
  return getMatchupsForPeriod(period.number).map((m) => {
    const side = (s: typeof m.away) => (isTeamSide(s) ? (byId.get(s.id) ?? null) : null);
    const label = !isTeamSide(m.away) || !isTeamSide(m.home) ? ("bye" in m.away || "bye" in m.home ? "BYE" : "TBD") : undefined;
    return { away: side(m.away), home: side(m.home), label };
  });
}
