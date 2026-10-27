import {
  formatPlayerName,
  getCurrentPeriod,
  getMatchupsForPeriod,
  getRoster,
  isTeamSide,
  leagueInfo,
  type RosterPlayer,
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
  /** Game logs this week (used for sorting / team GP). */
  games: number;
  /** Games started this week (final + in progress). */
  gamesPlayed: number;
  /** NBA games on this player's team this scoring period. */
  weekGames: number;
  fp: number;
  /** Fantasy points from the player's most recent game log, if any. */
  lastGameFp: number | null;
  /** Original projection for that last game, when it is a completed slate. */
  lastGameOrig: number | null;
  /** True when that last game is from an earlier slate than today. */
  lastGamePrior: boolean;
  /** Fantasy points from a game currently in progress (0 if none). */
  liveFp: number;
  live: boolean;
  playedToday: boolean;
  /** Upcoming (not started) games this week. */
  gamesRemaining: number;
  /** Projected FP from remaining games this week. */
  projRemaining: number;
  /** Week-to-date FP plus remaining-game projections. */
  projWeek: number;
  /** Frozen week-opening projection (every scheduled game this period). */
  origWeek: number;
  /** Remaining-game (and live leftover) projection means for the win-probability Gaussian. */
  remainSlices: number[];
  counting: boolean;
  rank: number; // 1-based within slot
};

export type TeamLineup = {
  team: Team;
  /** Official W-L-T from league standings. */
  record: string;
  /** Weekly score from counting players only (6 G + 6 F + 3 C). */
  score: number;
  /** Weekly points from everyone on the roster. */
  rosterTotal: number;
  groups: Record<Slot, LineupPlayer[]>;
  liveCount: number;
  playedTodayCount: number;
  countingGames: number;
  /** Upcoming (not started) games this week for counting lineup players. */
  gamesRemaining: number;
  /** Bestball week total using projected remaining games (re-ranks the lineup). */
  projScore: number;
  /** Roster week total including projected remaining games. */
  projRosterTotal: number;
  /** Bestball total from the frozen week-opening projections. */
  origScore: number;
  origRosterTotal: number;
  /** Probability this team wins its H2H matchup this week (0–100). */
  winPct: number | null;
};

export type LiveMatchup = {
  away: TeamLineup | null;
  home: TeamLineup | null;
  label?: string; // "BYE" / "TBD"
};

export function playerSlot(p: Pick<RosterPlayer, "rosterPosition" | "eligiblePos">): Slot {
  return (SLOTS.includes(p.rosterPosition as Slot) ? p.rosterPosition : p.eligiblePos.split(",")[0]) as Slot;
}

/** Weeks a rostered player has been in this team's top 6 G / 6 F / 3 C. Current week counts if they are in it now. */
export function bestballWeekCounts(teamId: string, stats: Stats): Record<string, number> {
  const current = getCurrentPeriod() ?? leagueInfo.scoringPeriods[0];
  const roster = getRoster(teamId);
  const counts: Record<string, number> = Object.fromEntries(roster.map((p) => [p.id, 0]));
  const periods = leagueInfo.scoringPeriods.filter((p) => p.number <= current.number);

  for (const period of periods) {
    const weekly = stats.periodLeaders(period);
    if (period.number !== current.number && weekly.length === 0) continue;
    const byId = new Map(weekly.filter((t) => t.fantraxId).map((t) => [t.fantraxId!, t]));
    const groups: Record<Slot, { id: string; fp: number; games: number; name: string }[]> = { G: [], F: [], C: [] };
    for (const p of roster) {
      const w = byId.get(p.id);
      groups[playerSlot(p)].push({
        id: p.id,
        fp: w?.fp ?? 0,
        games: w?.games ?? 0,
        name: formatPlayerName(p.name),
      });
    }
    for (const slot of SLOTS) {
      groups[slot]
        .sort((a, b) => b.fp - a.fp || b.games - a.games || a.name.localeCompare(b.name))
        .forEach((p, i) => {
          if (i < LINEUP_SLOTS[slot]) counts[p.id] += 1;
        });
    }
  }
  return counts;
}

export function buildLiveMatchups(lineups: TeamLineup[], period: ScoringPeriod): LiveMatchup[] {
  const byId = new Map(lineups.map((l) => [l.team.id, l]));
  return getMatchupsForPeriod(period.number).map((m) => {
    const side = (s: typeof m.away) => (isTeamSide(s) ? (byId.get(s.id) ?? null) : null);
    const label = !isTeamSide(m.away) || !isTeamSide(m.home) ? ("bye" in m.away || "bye" in m.home ? "BYE" : "TBD") : undefined;
    return { away: side(m.away), home: side(m.home), label };
  });
}
