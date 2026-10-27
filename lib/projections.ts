// Rotowire daily projections via Sleeper. Cached in memory; used to project
// remaining games in the current Fantrax week (actuals stay on ESPN/NBA logs).
// First-seen per-game lines are frozen in data/history/projections.json so
// later updates do not rewrite the original week-opening projection.
import projectionsHistory from "@/data/history/projections.json";
import { formatPlayerName, leagueInfo, playerMap, type Player, type ScoringPeriod } from "@/lib/data";
import { nbaTricode } from "@/lib/nba";
import type { ScoringRule } from "@/lib/scoring";
import { datesInPeriod } from "@/lib/stats";

export type PlayerGameProj = {
  date: string;
  fp: number;
  out: boolean;
};

export type WeekProjections = {
  byPlayer: Map<string, PlayerGameProj[]>;
  /** Frozen first-seen projection by player → date. Never overwritten. */
  baseline: Record<string, Record<string, number>>;
  fetchedAt: string | null;
};

type PeriodBaseline = { capturedAt: string; players: Record<string, Record<string, number>> };
type BaselineFile = {
  fetchedAt?: string | null;
  seasons: Record<string, { seasonYear: number; periods: Record<string, PeriodBaseline> }>;
};

const PROJ_TTL_MS = 10 * 60_000;
const SLEEPER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type SleeperStats = {
  pts?: number;
  reb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  to?: number;
  tpm?: number;
  dd?: number;
  td?: number;
  gp?: number;
};

type SleeperRow = {
  date?: string | null;
  company?: string;
  stats?: SleeperStats;
  team?: string | null;
  player_id?: string;
  player?: {
    first_name?: string;
    last_name?: string;
    team?: string | null;
    injury_status?: string | null;
  };
};

type ProjState = {
  key: string;
  at: number;
  data: WeekProjections;
  inflight: Promise<WeekProjections> | null;
};

const g = globalThis as unknown as { __weekProjections?: ProjState };
const empty: WeekProjections = { byPlayer: new Map(), baseline: {}, fetchedAt: null };

const baselines = projectionsHistory as BaselineFile;

function seasonKey(): string {
  return `${leagueInfo.seasonYear}-${String(leagueInfo.seasonYear + 1).slice(-2)}`;
}

function seasonPeriods(): Record<string, PeriodBaseline> {
  const key = seasonKey();
  baselines.seasons ??= {};
  baselines.seasons[key] ??= { seasonYear: leagueInfo.seasonYear, periods: {} };
  return baselines.seasons[key].periods;
}

function normalizeName(name: string): string {
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

function n(v: number | undefined): number {
  return Number.isFinite(v) ? Number(v) : 0;
}

/** Score a projected line with league rules. Uses expected DD/TD rates, not 10+ thresholds. */
export function projectedFantasyPoints(stats: SleeperStats, rules: ScoringRule[]): number {
  const line: Record<string, number> = {
    PTS: n(stats.pts),
    REB: n(stats.reb),
    AST: n(stats.ast),
    ST: n(stats.stl),
    BLK: n(stats.blk),
    TO: n(stats.to),
    "3PTM": n(stats.tpm),
    "2D": n(stats.dd),
    "3D": n(stats.td),
  };
  let total = 0;
  for (const rule of rules) {
    if (line[rule.shortName] == null) continue;
    total += line[rule.shortName] * rule.points;
  }
  return Math.round(total * 100) / 100;
}

function isOut(status: string | null | undefined): boolean {
  const s = (status ?? "").toUpperCase();
  return s === "OUT" || s === "O" || s === "IR" || s === "SUS" || s === "SUSPENDED";
}

function dayDiff(startYmd: string, ymd: string): number {
  const a = Date.parse(`${startYmd}T00:00:00Z`);
  const b = Date.parse(`${ymd}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Sleeper week 1 is opening week (6 days); later weeks are 7 days. */
function sleeperWeekForDate(ymd: string): number {
  const start = String(leagueInfo.startDate).slice(0, 10);
  const days = dayDiff(start, ymd);
  if (days <= 5) return 1;
  return 2 + Math.floor((days - 6) / 7);
}

function sleeperWeeksForPeriod(period: ScoringPeriod): number[] {
  const weeks = new Set<number>();
  for (const date of datesInPeriod(period)) {
    const w = sleeperWeekForDate(date);
    weeks.add(Math.max(1, w));
    weeks.add(Math.max(1, w + 1));
  }
  return [...weeks].sort((a, b) => a - b);
}

function buildMatcher(players: Record<string, Player>) {
  const byName = new Map<string, Player[]>();
  const byLastAndTeam = new Map<string, Player[]>();
  const push = (map: Map<string, Player[]>, key: string, p: Player) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  };
  for (const p of Object.values(players)) {
    push(byName, normalizeName(formatPlayerName(p.name)), p);
    push(byLastAndTeam, `${normalizeName(p.name.split(",")[0])}|${nbaTricode(p.nbaTeam)}`, p);
  }
  return (fullName: string, team: string): string | null => {
    const full = normalizeName(fullName);
    const t = nbaTricode(team);
    const candidates = byName.get(full);
    if (candidates?.length === 1) return candidates[0].id;
    if (candidates && candidates.length > 1) {
      return (candidates.find((c) => nbaTricode(c.nbaTeam) === t) ?? candidates[0]).id;
    }
    const last = full.split(" ").pop() ?? "";
    const fallback = byLastAndTeam.get(`${last}|${t}`);
    if (fallback?.length === 1) return fallback[0].id;
    const sameInitial = fallback?.filter((c) => normalizeName(formatPlayerName(c.name))[0] === full[0]);
    return sameInitial?.length === 1 ? sameInitial[0].id : null;
  };
}

const matchPlayer = buildMatcher(playerMap);

async function fetchSleeperWeek(week: number): Promise<SleeperRow[]> {
  const res = await fetch(`https://api.sleeper.com/projections/nba/${leagueInfo.seasonYear}/${week}?season_type=regular`, {
    headers: { Accept: "application/json", "User-Agent": SLEEPER_UA },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`sleeper projections week ${week} -> HTTP ${res.status}`);
  const json = (await res.json()) as SleeperRow[];
  return Array.isArray(json) ? json : [];
}

function indexRows(rows: SleeperRow[], allowedDates: Set<string>): WeekProjections {
  const byPlayer = new Map<string, PlayerGameProj[]>();
  const rules = leagueInfo.scoring;
  for (const row of rows) {
    const date = row.date;
    if (!date || !allowedDates.has(date)) continue;
    const first = row.player?.first_name ?? "";
    const last = row.player?.last_name ?? "";
    const name = `${first} ${last}`.trim();
    const team = row.team || row.player?.team || "";
    const id = matchPlayer(name, team);
    if (!id) continue;
    const out = isOut(row.player?.injury_status) || n(row.stats?.gp) === 0;
    const fp = out ? 0 : projectedFantasyPoints(row.stats ?? {}, rules);
    const list = byPlayer.get(id) ?? [];
    if (!list.some((p) => p.date === date)) list.push({ date, fp, out });
    byPlayer.set(id, list);
  }
  return { byPlayer, baseline: {}, fetchedAt: new Date().toISOString() };
}

function periodKey(period: ScoringPeriod): string {
  return String(period.number);
}

function freezeBaseline(live: WeekProjections, period: ScoringPeriod): { data: WeekProjections; dirty: boolean } {
  const key = periodKey(period);
  const periods = seasonPeriods();
  const stored = structuredClone(periods[key]?.players ?? {});
  let dirty = false;
  for (const [id, games] of live.byPlayer) {
    const slot = stored[id] ?? (stored[id] = {});
    for (const g of games) {
      if (slot[g.date] == null) {
        slot[g.date] = g.fp;
        dirty = true;
      }
    }
  }
  if (dirty) {
    const prev = periods[key];
    periods[key] = { capturedAt: prev?.capturedAt ?? new Date().toISOString(), players: stored };
  }
  return { data: { ...live, baseline: stored }, dirty };
}

export function playerGameProjection(
  projs: WeekProjections | null | undefined,
  playerId: string,
  date: string | undefined,
): number | null {
  if (!date) return null;
  const frozen = projs?.baseline?.[playerId]?.[date];
  if (frozen != null) return frozen;
  const live = projs?.byPlayer.get(playerId)?.find((g) => g.date === date);
  return live ? live.fp : null;
}

export function playerOrigWeek(
  projs: WeekProjections | null | undefined,
  playerId: string,
  dates: string[],
): number {
  if (!dates.length) return 0;
  let total = 0;
  for (const date of dates) {
    const fp = playerGameProjection(projs, playerId, date);
    if (fp != null) total += fp;
  }
  return Math.round(total * 100) / 100;
}

export function playerProjectedRemaining(
  projs: WeekProjections | null | undefined,
  playerId: string,
  remainingDates: string[],
  fallbackFppg = 0,
): number {
  if (!remainingDates.length) return 0;
  const rows = projs?.byPlayer.get(playerId) ?? [];
  const byDate = new Map(rows.map((r) => [r.date, r]));
  let total = 0;
  for (const date of remainingDates) {
    const row = byDate.get(date);
    if (row?.out) continue;
    total += row ? row.fp : fallbackFppg;
  }
  return Math.round(total * 100) / 100;
}

export async function getWeekProjections(period: ScoringPeriod): Promise<WeekProjections> {
  const dates = datesInPeriod(period);
  const key = `${period.number}:${dates[0] ?? ""}:${dates.at(-1) ?? ""}`;
  const state = (g.__weekProjections ??= { key: "", at: 0, data: empty, inflight: null });
  if (state.key === key && Date.now() - state.at < PROJ_TTL_MS && state.data.byPlayer.size) {
    return state.data;
  }
  if (state.inflight && state.key === key) return state.inflight;

  const weeks = sleeperWeeksForPeriod(period);
  state.key = key;
  state.inflight = Promise.allSettled(weeks.map((w) => fetchSleeperWeek(w)))
    .then((results) => {
      const rows: SleeperRow[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") rows.push(...r.value);
        else console.warn(`[projections] ${r.reason?.message ?? r.reason}`);
      }
      const live = indexRows(rows, new Set(dates));
      const { data } = freezeBaseline(live, period);
      if (data.byPlayer.size) {
        state.data = data;
        state.at = Date.now();
      }
      return data.byPlayer.size ? data : state.data.byPlayer.size ? state.data : data;
    })
    .catch((err: Error) => {
      console.warn(`[projections] ${err.message}`);
      return state.data;
    })
    .finally(() => {
      state.inflight = null;
    });
  return state.inflight;
}
