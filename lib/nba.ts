// Live NBA stats loader. Pulls season game logs from stats.nba.com and live box
// scores from the NBA CDN, matches players to Fantrax IDs, and keeps the result
// in an in-process cache that refreshes every LIVE_TTL_MS. Pages call
// getLiveGameLogs(); the first call does a real fetch, later calls are instant
// and revalidate in the background. data/gamelogs.json (written by
// `npm run fetch-stats`) is used as a fallback if the NBA endpoints are down.
import snapshotJson from "@/data/gamelogs.json";
import { leagueInfo, playerMap, type Player } from "@/lib/data";
import type { StatLine } from "@/lib/scoring";

export type GameLog = StatLine & {
  gameId: string;
  date: string; // YYYY-MM-DD (ET)
  nbaId: number;
  name: string;
  team: string;
  matchup: string;
  min: number;
  live: boolean;
  fantraxId: string | null;
};

export type Game = {
  gameId: string;
  date: string;
  status: number; // 1 scheduled, 2 live, 3 final
  statusText: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
};

export type GameLogSnapshot = {
  fetchedAt: string | null;
  season: string;
  today: string;
  games: Game[];
  logs: GameLog[];
  /** Where this snapshot came from: live fetch, or the on-disk fallback. */
  source: "live" | "file";
};

/** How often live scores/box scores are refreshed. */
export const LIVE_TTL_MS = 60_000;
/** Completed-game logs change rarely; refresh them less aggressively. */
const SEASON_TTL_MS = 5 * 60_000;

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

const SEASON = `${leagueInfo.seasonYear}-${String(leagueInfo.seasonYear + 1).slice(-2)}`;

// ---------------------------------------------------------------------------
// NBA endpoints

async function nba<T = unknown>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://stats.nba.com/stats/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: NBA_HEADERS, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${endpoint} -> HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/** Today's date in US Eastern time as YYYY-MM-DD (NBA game dates are ET). */
export function todayEt(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

/** "PT34M12.00S" or "34:12" or 34.2 -> minutes as a number. */
function parseMinutes(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v);
  const iso = /^PT(?:(\d+)M)?(?:([\d.]+)S)?$/.exec(s);
  if (iso) return Number(iso[1] ?? 0) + Number(iso[2] ?? 0) / 60;
  const clock = /^(\d+):(\d+)$/.exec(s);
  if (clock) return Number(clock[1]) + Number(clock[2]) / 60;
  return Number(s) || 0;
}

type ResultSet = { headers: string[]; rowSet: unknown[][] };

async function fetchSeasonGameLogs(): Promise<GameLog[]> {
  const json = await nba<{ resultSets: ResultSet[] }>("playergamelogs", {
    Season: SEASON,
    SeasonType: "Regular Season",
    LeagueID: "00",
  });
  const rs = json.resultSets[0];
  const idx = Object.fromEntries(rs.headers.map((h, i) => [h, i])) as Record<string, number>;
  const n = (row: unknown[], key: string) => Number(row[idx[key]] ?? 0);
  return rs.rowSet.map((row) => ({
    gameId: String(row[idx.GAME_ID]),
    date: String(row[idx.GAME_DATE]).slice(0, 10),
    nbaId: n(row, "PLAYER_ID"),
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
    live: false,
    fantraxId: null,
  }));
}

type ScoreboardGame = {
  gameId: string;
  gameStatus: number;
  gameStatusText: string;
  homeTeam?: { teamTricode: string; score?: number };
  awayTeam?: { teamTricode: string; score?: number };
};

const CDN_HEADERS = {
  "User-Agent": NBA_HEADERS["User-Agent"],
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.nba.com/",
  Origin: "https://www.nba.com",
};

/**
 * Today's scoreboard. The CDN live feed updates in real time; stats.nba.com's
 * scoreboardv3 can lag by minutes, so it is only the fallback.
 */
async function fetchScoreboard(date: string): Promise<Game[]> {
  let games: ScoreboardGame[] | null = null;
  try {
    const res = await fetch("https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json", {
      headers: CDN_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const json = (await res.json()) as { scoreboard?: { gameDate?: string; games?: ScoreboardGame[] } };
      if (json.scoreboard?.gameDate === date) games = json.scoreboard.games ?? [];
    }
  } catch (err) {
    console.warn(`[nba] cdn scoreboard failed: ${(err as Error).message}`);
  }
  if (!games) {
    const json = await nba<{ scoreboard?: { games?: ScoreboardGame[] } }>("scoreboardv3", { GameDate: date, LeagueID: "00" });
    games = json.scoreboard?.games ?? [];
  }
  return games.map((g) => ({
    gameId: g.gameId,
    date,
    status: g.gameStatus,
    statusText: g.gameStatusText,
    home: g.homeTeam?.teamTricode ?? "",
    away: g.awayTeam?.teamTricode ?? "",
    homeScore: g.homeTeam?.score ?? 0,
    awayScore: g.awayTeam?.score ?? 0,
  }));
}

type BoxPlayer = {
  personId: number;
  name?: string;
  firstName?: string;
  familyName?: string;
  statistics?: Record<string, unknown>;
};
type BoxTeam = { teamTricode: string; players?: BoxPlayer[] };
type BoxScore = { game: { gameStatus: number; homeTeam: BoxTeam; awayTeam: BoxTeam } };

/** Live box scores come from the NBA CDN; stats.nba.com box scores are empty until a game is final. */
async function fetchLiveBoxScore(game: Game): Promise<GameLog[]> {
  const res = await fetch(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${game.gameId}.json`, {
    headers: CDN_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`live boxscore -> HTTP ${res.status}`);
  const box = ((await res.json()) as BoxScore).game;
  const rows: GameLog[] = [];
  for (const [side, opp] of [
    ["homeTeam", "awayTeam"],
    ["awayTeam", "homeTeam"],
  ] as const) {
    const team = box[side];
    const isHome = side === "homeTeam";
    for (const p of team.players ?? []) {
      const s = p.statistics ?? {};
      const min = parseMinutes(s.minutes);
      if (!min && !s.points) continue; // DNP
      rows.push({
        gameId: game.gameId,
        date: game.date,
        nbaId: p.personId,
        name: p.name ?? `${p.firstName ?? ""} ${p.familyName ?? ""}`.trim(),
        team: team.teamTricode,
        matchup: `${team.teamTricode} ${isHome ? "vs." : "@"} ${box[opp].teamTricode}`,
        min: Math.round(min * 10) / 10,
        pts: Number(s.points ?? 0),
        reb: Number(s.reboundsTotal ?? 0),
        ast: Number(s.assists ?? 0),
        stl: Number(s.steals ?? 0),
        blk: Number(s.blocks ?? 0),
        tov: Number(s.turnovers ?? 0),
        fg3m: Number(s.threePointersMade ?? 0),
        live: box.gameStatus !== 3,
        fantraxId: null,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// NBA -> Fantrax player matching

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

function flipName(name: string): string {
  const [last, first] = name.split(",").map((s) => s.trim());
  return first ? `${first} ${last}` : name;
}

const TRICODE_ALIASES: Record<string, string> = { GS: "GSW", NO: "NOP", NY: "NYK", SA: "SAS", PHO: "PHX" };
const nbaTricode = (code: string) => TRICODE_ALIASES[code] ?? code;

function buildPlayerMatcher(players: Record<string, Player>) {
  const byName = new Map<string, Player[]>();
  const byLastAndTeam = new Map<string, Player[]>();
  const push = (map: Map<string, Player[]>, key: string, p: Player) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  };
  for (const p of Object.values(players)) {
    push(byName, normalizeName(flipName(p.name)), p);
    push(byLastAndTeam, `${normalizeName(p.name.split(",")[0])}|${nbaTricode(p.nbaTeam)}`, p);
  }
  return (nbaName: string, nbaTeam: string): string | null => {
    const full = normalizeName(nbaName);
    const candidates = byName.get(full);
    if (candidates?.length === 1) return candidates[0].id;
    if (candidates && candidates.length > 1) {
      return (candidates.find((c) => nbaTricode(c.nbaTeam) === nbaTeam) ?? candidates[0]).id;
    }
    // Nickname differences ("Ron" vs "Ronald"): unique last name on the same NBA team.
    const last = full.split(" ").pop() ?? "";
    const fallback = byLastAndTeam.get(`${last}|${nbaTeam}`);
    if (fallback?.length === 1) return fallback[0].id;
    const sameInitial = fallback?.filter((c) => normalizeName(flipName(c.name))[0] === full[0]);
    return sameInitial?.length === 1 ? sameInitial[0].id : null;
  };
}

const matchPlayer = buildPlayerMatcher(playerMap);

// ---------------------------------------------------------------------------
// Cache + refresh loop (state lives on globalThis so it survives dev HMR)

type LiveState = {
  snapshot: GameLogSnapshot | null;
  snapshotAt: number;
  season: { logs: GameLog[]; at: number } | null;
  inflight: Promise<GameLogSnapshot> | null;
  timer: ReturnType<typeof setInterval> | null;
  lastError: string | null;
};

const g = globalThis as unknown as { __nbaLive?: LiveState };
const state: LiveState = (g.__nbaLive ??= {
  snapshot: null,
  snapshotAt: 0,
  season: null,
  inflight: null,
  timer: null,
  lastError: null,
});

// After a dev HMR re-evaluation, let this (newest) module own the refresh loop.
if (state.timer) {
  clearInterval(state.timer);
  state.timer = null;
}

const fileSnapshot: GameLogSnapshot = { ...(snapshotJson as unknown as Omit<GameLogSnapshot, "source">), source: "file" };

async function refresh(): Promise<GameLogSnapshot> {
  const now = Date.now();

  // Season logs: reuse if fresh enough.
  let seasonLogs: GameLog[];
  if (state.season && now - state.season.at < SEASON_TTL_MS) {
    seasonLogs = state.season.logs;
  } else {
    seasonLogs = await fetchSeasonGameLogs();
    state.season = { logs: seasonLogs, at: now };
  }

  const logs = [...seasonLogs];
  const today = todayEt();
  let games: Game[] = [];
  try {
    games = await fetchScoreboard(today);
    const have = new Set(logs.map((l) => l.gameId));
    const pending = games.filter((g) => g.status >= 2 && !have.has(g.gameId));
    const boxes = await Promise.allSettled(pending.map((g) => fetchLiveBoxScore(g)));
    boxes.forEach((r, i) => {
      if (r.status === "fulfilled") logs.push(...r.value);
      else console.warn(`[nba] box score failed for ${pending[i].gameId}: ${r.reason?.message ?? r.reason}`);
    });
  } catch (err) {
    console.warn(`[nba] scoreboard failed: ${(err as Error).message}`);
    games = state.snapshot?.games.filter((g) => g.date === today) ?? [];
  }

  for (const l of logs) l.fantraxId = matchPlayer(l.name, l.team);
  logs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));

  return { fetchedAt: new Date().toISOString(), season: SEASON, today, games, logs, source: "live" };
}

function refreshInBackground(): Promise<GameLogSnapshot> {
  if (state.inflight) return state.inflight;
  state.inflight = refresh()
    .then((snap) => {
      state.snapshot = snap;
      state.snapshotAt = Date.now();
      state.lastError = null;
      return snap;
    })
    .catch((err: Error) => {
      state.lastError = err.message;
      console.warn(`[nba] refresh failed: ${err.message}`);
      return state.snapshot ?? fileSnapshot;
    })
    .finally(() => {
      state.inflight = null;
    });
  return state.inflight;
}

function ensureKeepWarm() {
  if (state.timer) return;
  state.timer = setInterval(() => {
    refreshInBackground();
  }, LIVE_TTL_MS);
  // Don't keep the process alive just for this.
  (state.timer as { unref?: () => void }).unref?.();
}

/**
 * Current game logs. First call fetches live data (falls back to the on-disk
 * snapshot on failure); afterwards returns the cached snapshot immediately and
 * refreshes in the background whenever it is older than LIVE_TTL_MS.
 */
export async function getLiveGameLogs(): Promise<GameLogSnapshot> {
  ensureKeepWarm();
  if (!state.snapshot) return refreshInBackground();
  if (Date.now() - state.snapshotAt > LIVE_TTL_MS) void refreshInBackground();
  return state.snapshot;
}

export function getLiveStatus() {
  return { lastError: state.lastError, snapshotAt: state.snapshotAt, refreshing: state.inflight !== null };
}
