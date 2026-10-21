import {
  formatPlayerName,
  getTeamName,
  leagueInfo,
  parseDate,
  playerMap,
  playerTeamMap,
  type ScoringPeriod,
} from "@/lib/data";
import { getLiveGameLogs, type Game, type GameLog, type GameLogSnapshot } from "@/lib/nba";
import { fantasyPoints, isDoubleDouble, isTripleDouble } from "@/lib/scoring";

export type { Game, GameLog } from "@/lib/nba";

export type ScoredLog = GameLog & {
  fp: number;
  dd: boolean;
  td: boolean;
  displayName: string;
  fantasyTeamId: string | null;
  fantasyTeamName: string | null;
  /** Fantrax pool status: T = rostered, FA = free agent, WW = on waivers. */
  ownerStatus: "T" | "FA" | "WW";
  /** Opponent-only matchup, e.g. "@DET" or "vs BOS". */
  opponent: string;
};

/** "BOS @ DET" -> "@DET"; "BOS vs. DET" -> "vs DET". */
export function shortMatchup(matchup: string, team: string): string {
  const m = matchup.match(/^(\w+)\s*(@|vs\.?)\s*(\w+)$/i);
  if (!m) return matchup;
  const [, a, sep, b] = m;
  const opp = a.toUpperCase() === team.toUpperCase() ? b : a;
  return sep === "@" ? `@${opp}` : `vs ${opp}`;
}

function score(log: GameLog): ScoredLog {
  const fantasyTeamId = log.fantraxId ? (playerTeamMap[log.fantraxId] ?? null) : null;
  const fx = log.fantraxId ? playerMap[log.fantraxId] : undefined;
  const ownerStatus: ScoredLog["ownerStatus"] = fantasyTeamId ? "T" : fx?.status === "WW" ? "WW" : "FA";
  return {
    ...log,
    fp: fantasyPoints(log, leagueInfo.scoring),
    dd: isDoubleDouble(log),
    td: isTripleDouble(log),
    displayName: fx ? formatPlayerName(fx.name) : log.name,
    fantasyTeamId,
    fantasyTeamName: fantasyTeamId ? getTeamName(fantasyTeamId) : null,
    ownerStatus,
    opponent: shortMatchup(log.matchup, log.team),
  };
}

export type StatsMeta = { fetchedAt: string | null; season: string; today: string; source: "live" | "file" };

export type Stats = {
  meta: StatsMeta;
  games: Game[];
  logs: ScoredLog[];
  /** All dates (YYYY-MM-DD) that have at least one game log, ascending. */
  gameDates: string[];
  dailyLeaders(date: string): ScoredLog[];
  /** A player's scored game logs, newest first. */
  playerLogs(fantraxId: string): ScoredLog[];
  logsInPeriod(period: ScoringPeriod): ScoredLog[];
  periodLeaders(period: ScoringPeriod): PeriodPlayerTotal[];
  seasonLeaders(): PeriodPlayerTotal[];
};

// Scored logs are derived once per snapshot, not once per request.
const scoredCache = new WeakMap<GameLogSnapshot, Stats>();

function buildStats(snapshot: GameLogSnapshot): Stats {
  const logs = snapshot.logs.map(score);
  const byDate = new Map<string, ScoredLog[]>();
  const byPlayer = new Map<string, ScoredLog[]>();
  for (const l of logs) {
    (byDate.get(l.date) ?? byDate.set(l.date, []).get(l.date)!).push(l);
    if (l.fantraxId) (byPlayer.get(l.fantraxId) ?? byPlayer.set(l.fantraxId, []).get(l.fantraxId)!).push(l);
  }
  const gameDates = [...byDate.keys()].sort();

  const logsInPeriod = (period: ScoringPeriod) => {
    const dates = new Set(datesInPeriod(period));
    return logs.filter((l) => dates.has(l.date));
  };

  return {
    meta: { fetchedAt: snapshot.fetchedAt, season: snapshot.season, today: snapshot.today, source: snapshot.source },
    games: snapshot.games,
    logs,
    gameDates,
    dailyLeaders: (date) => [...(byDate.get(date) ?? [])].sort((a, b) => b.fp - a.fp || b.pts - a.pts),
    playerLogs: (id) => [...(byPlayer.get(id) ?? [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    logsInPeriod,
    periodLeaders: (period) => aggregatePeriod(logsInPeriod(period)),
    seasonLeaders: () => aggregatePeriod(logs),
  };
}

/** Live stats. Each call waits for a fresh ESPN/NBA fetch (see lib/nba.ts). */
export async function getStats(): Promise<Stats> {
  const snapshot = await getLiveGameLogs();
  let stats = scoredCache.get(snapshot);
  if (!stats) {
    stats = buildStats(snapshot);
    scoredCache.set(snapshot, stats);
  }
  return stats;
}

/** Dates (YYYY-MM-DD, ET) covered by a scoring period. */
export function datesInPeriod(period: ScoringPeriod): string[] {
  const dates: string[] = [];
  const d = parseDate(period.startDate);
  d.setHours(0, 0, 0, 0);
  const end = parseDate(period.endDate);
  while (d <= end) {
    dates.push(toYmd(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

export function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type FpRank = { rank: number; of: number };

/** Competition rank in a list already sorted by fantasy points descending. */
export function rankInFpList<T>(sortedDesc: T[], pred: (row: T) => boolean, fp: (row: T) => number): FpRank | null {
  const i = sortedDesc.findIndex(pred);
  if (i < 0) return null;
  const value = fp(sortedDesc[i]);
  let rank = i + 1;
  while (rank > 1 && fp(sortedDesc[rank - 2]) === value) rank--;
  return { rank, of: sortedDesc.length };
}

export type PeriodPlayerTotal = {
  key: string;
  displayName: string;
  team: string;
  fantraxId: string | null;
  fantasyTeamId: string | null;
  fantasyTeamName: string | null;
  ownerStatus: ScoredLog["ownerStatus"];
  games: number;
  fp: number;
  avg: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  tov: number;
  fg3m: number;
  live: boolean;
};

function aggregatePeriod(periodLogs: ScoredLog[]): PeriodPlayerTotal[] {
  const totals = new Map<string, PeriodPlayerTotal>();
  for (const l of periodLogs) {
    const key = l.fantraxId ?? `nba:${l.nbaId}`;
    let t = totals.get(key);
    if (!t) {
      t = {
        key,
        displayName: l.displayName,
        team: l.team,
        fantraxId: l.fantraxId,
        fantasyTeamId: l.fantasyTeamId,
        fantasyTeamName: l.fantasyTeamName,
        ownerStatus: l.ownerStatus,
        games: 0,
        fp: 0,
        avg: 0,
        min: 0,
        pts: 0,
        reb: 0,
        ast: 0,
        stl: 0,
        blk: 0,
        tov: 0,
        fg3m: 0,
        live: false,
      };
      totals.set(key, t);
    }
    t.games++;
    t.fp += l.fp;
    t.min += l.min;
    t.pts += l.pts;
    t.reb += l.reb;
    t.ast += l.ast;
    t.stl += l.stl;
    t.blk += l.blk;
    t.tov += l.tov;
    t.fg3m += l.fg3m;
    t.live ||= l.live;
  }
  return [...totals.values()]
    .map((t) => ({ ...t, fp: round2(t.fp), avg: t.games ? round2(t.fp / t.games) : 0 }))
    .sort((a, b) => b.fp - a.fp);
}

export type FantasyTeamTotal = { teamId: string; teamName: string; fp: number; playerGames: number; players: number };

/** Computed fantasy points per league team from rostered players' game logs. */
export function getFantasyTeamTotals(logs: ScoredLog[]): FantasyTeamTotal[] {
  const totals = new Map<string, FantasyTeamTotal & { ids: Set<string> }>();
  for (const t of leagueInfo.teams) totals.set(t.id, { teamId: t.id, teamName: t.name, fp: 0, playerGames: 0, players: 0, ids: new Set() });
  for (const l of logs) {
    if (!l.fantasyTeamId || !l.fantraxId) continue;
    const t = totals.get(l.fantasyTeamId);
    if (!t) continue;
    t.fp += l.fp;
    t.playerGames++;
    t.ids.add(l.fantraxId);
  }
  return [...totals.values()]
    .map(({ ids, ...t }) => ({ ...t, fp: round2(t.fp), players: ids.size }))
    .sort((a, b) => b.fp - a.fp);
}

/**
 * Most recent game date whose slate is fully complete: no in-progress logs, and
 * (if it's today) every scheduled game has gone final. Null if nothing qualifies.
 */
export function latestCompletedDate(stats: Stats): string | null {
  for (const date of [...stats.gameDates].reverse()) {
    const logs = stats.dailyLeaders(date);
    if (logs.some((l) => l.live)) continue;
    if (date === stats.meta.today && stats.games.some((g) => g.status !== 3)) continue;
    return date;
  }
  return null;
}

/**
 * Which slate to publish: the latest completed one, or — if none exists yet —
 * the most recent date with any box scores, flagged as in progress.
 */
export function publishableDate(stats: Stats): { date: string; complete: boolean } | null {
  const complete = latestCompletedDate(stats);
  if (complete) return { date: complete, complete: true };
  const latest = stats.gameDates.at(-1);
  return latest ? { date: latest, complete: false } : null;
}

/** "Updated 9:45:12 PM" style label for page headers. */
export function updatedLabel(meta: StatsMeta): string {
  if (!meta.fetchedAt) return "no stats loaded";
  const t = new Date(meta.fetchedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
  return meta.source === "file" ? `snapshot from ${t}` : `updated ${t}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
