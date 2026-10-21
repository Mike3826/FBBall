import {
  formatPlayerName,
  getCurrentPeriod,
  getMatchupsForPeriod,
  getRoster,
  isTeamSide,
  leagueInfo,
  standingsRows,
  type RosterPlayer,
  type ScoringPeriod,
  type Team,
} from "@/lib/data";
import { nbaTeamInGame } from "@/lib/nba";
import { datesInPeriod, type Stats } from "@/lib/stats";

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
  /** Fantasy points from a game currently in progress (0 if none). */
  liveFp: number;
  live: boolean;
  playedToday: boolean;
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
};

export type LiveMatchup = {
  away: TeamLineup | null;
  home: TeamLineup | null;
  label?: string; // "BYE" / "TBD"
};

const r2 = (n: number) => Math.round(n * 100) / 100;

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

function lastGameFpByPlayer(stats: Stats): Map<string, number> {
  const latest = new Map<string, { date: string; fp: number }>();
  for (const l of stats.logs) {
    if (!l.fantraxId) continue;
    const cur = latest.get(l.fantraxId);
    if (!cur || l.date > cur.date) latest.set(l.fantraxId, { date: l.date, fp: l.fp });
  }
  return new Map([...latest].map(([id, v]) => [id, v.fp]));
}

export function buildTeamLineups(stats: Stats, period: ScoringPeriod): TeamLineup[] {
  const weekly = new Map(stats.periodLeaders(period).filter((t) => t.fantraxId).map((t) => [t.fantraxId!, t]));
  const today = new Map(stats.dailyLeaders(stats.meta.today).filter((l) => l.fantraxId).map((l) => [l.fantraxId!, l]));
  const lastGame = lastGameFpByPlayer(stats);
  const weekDates = new Set(datesInPeriod(period));
  const weekSlate = stats.games.filter((g) => weekDates.has(g.date));

  return leagueInfo.teams.map((team) => {
    const groups: Record<Slot, LineupPlayer[]> = { G: [], F: [], C: [] };
    for (const p of getRoster(team.id)) {
      const slot = playerSlot(p);
      const w = weekly.get(p.id);
      const t = today.get(p.id);
      const slate = weekSlate.filter((g) => nbaTeamInGame(p.nbaTeam, g));
      const started = slate.filter((g) => g.status >= 2).length;
      const logged = w?.games ?? 0;
      // In-progress games count as played even before a box score lands.
      const gamesPlayed = Math.max(started, logged, t?.live ? 1 : 0);
      groups[slot].push({
        id: p.id,
        name: formatPlayerName(p.name),
        nbaTeam: p.nbaTeam,
        slot,
        eligiblePos: p.eligiblePos,
        games: logged,
        gamesPlayed,
        weekGames: Math.max(slate.length, gamesPlayed),
        fp: w?.fp ?? 0,
        lastGameFp: lastGame.has(p.id) ? lastGame.get(p.id)! : null,
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
    let gamesRemaining = 0;
    const upcoming = weekSlate.filter((g) => g.status === 1);
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
          gamesRemaining += upcoming.filter((g) => nbaTeamInGame(p.nbaTeam, g)).length;
        }
      });
    }

    const record = standingsRows.find((s) => s.teamId === team.id)?.points ?? "";
    return { team, record, score: r2(score), rosterTotal: r2(rosterTotal), groups, liveCount, playedTodayCount, countingGames, gamesRemaining };
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
