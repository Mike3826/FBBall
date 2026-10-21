// Live NBA stats loader. Scoreboard and box scores come from ESPN (NBA's own
// CDN and stats.nba.com block most cloud IPs, including Vercel). Season logs
// from stats.nba.com are used when that host responds. Pages always await a
// live fetch — we do not serve a stale on-disk snapshot.
import { getCurrentPeriod, leagueInfo, playerMap, type Player } from "@/lib/data";
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

/** NBA game IDs encode season type in the 3rd digit: 4 = playoffs, 5 = play-in. */
export function isNbaPostseasonGame(gameId: string): boolean {
  return gameId.length >= 3 && gameId.startsWith("00") && (gameId[2] === "4" || gameId[2] === "5");
}

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

const TRICODE_ALIASES: Record<string, string> = {
  GS: "GSW",
  NO: "NOP",
  NY: "NYK",
  SA: "SAS",
  PHO: "PHX",
  WSH: "WAS",
  UTAH: "UTA",
  UT: "UTA",
};
export const nbaTricode = (code: string) => TRICODE_ALIASES[code] ?? code;

export function nbaTeamInGame(nbaTeam: string, game: Game): boolean {
  const t = nbaTricode(nbaTeam);
  return nbaTricode(game.home) === t || nbaTricode(game.away) === t;
}

// ---------------------------------------------------------------------------
// NBA endpoints

async function nba<T = unknown>(endpoint: string, params: Record<string, string>, timeoutMs = 8_000): Promise<T> {
  const url = new URL(`https://stats.nba.com/stats/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: NBA_HEADERS, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
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
      signal: AbortSignal.timeout(4_000),
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
    signal: AbortSignal.timeout(4_000),
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
// ESPN fallback (works from Vercel; NBA CDN/stats often do not)

const ESPN_HEADERS = {
  "User-Agent": NBA_HEADERS["User-Agent"],
  Accept: "application/json",
};

type EspnCompetitor = {
  homeAway: "home" | "away";
  score?: string;
  team?: { abbreviation?: string };
};
type EspnEvent = {
  id: string;
  competitions?: {
    competitors?: EspnCompetitor[];
  }[];
  status?: {
    type?: { state?: string; name?: string; detail?: string; shortDetail?: string };
  };
};
type EspnAthleteRow = {
  didNotPlay?: boolean;
  athlete?: { id?: string; displayName?: string };
  stats?: string[];
};
type EspnBoxTeam = {
  team?: { abbreviation?: string };
  statistics?: { keys?: string[]; athletes?: EspnAthleteRow[] }[];
};

async function espnJson<T>(url: string, timeoutMs = 10_000): Promise<T> {
  const res = await fetch(url, { headers: ESPN_HEADERS, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`espn ${url} -> HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

function ymdToEspn(date: string): string {
  return date.replaceAll("-", "");
}

function etYmd(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(value));
}

function eachEtDate(startYmd: string, endYmd: string): string[] {
  const dates: string[] = [];
  let cur = startYmd;
  while (cur <= endYmd) {
    dates.push(cur);
    const [y, m, d] = cur.split("-").map(Number);
    cur = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  }
  return dates;
}

function espnGameStatus(event: EspnEvent): { status: number; statusText: string } {
  const type = event.status?.type;
  const state = type?.state ?? "pre";
  const status = state === "post" ? 3 : state === "in" ? 2 : 1;
  return { status, statusText: type?.shortDetail || type?.detail || type?.name || "" };
}

function espnStat(keys: string[], stats: string[], key: string): number {
  const i = keys.indexOf(key);
  if (i < 0) return 0;
  const raw = stats[i] ?? "0";
  if (raw.includes("-")) return Number(raw.split("-")[0]) || 0;
  return Number.parseFloat(raw) || 0;
}

async function fetchEspnScoreboard(date: string): Promise<Game[]> {
  const json = await espnJson<{ events?: EspnEvent[] }>(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${ymdToEspn(date)}&limit=100`,
  );
  return (json.events ?? []).map((event) => {
    const comps = event.competitions?.[0]?.competitors ?? [];
    const home = comps.find((c) => c.homeAway === "home");
    const away = comps.find((c) => c.homeAway === "away");
    const { status, statusText } = espnGameStatus(event);
    return {
      gameId: event.id,
      date,
      status,
      statusText,
      home: nbaTricode(home?.team?.abbreviation ?? ""),
      away: nbaTricode(away?.team?.abbreviation ?? ""),
      homeScore: Number(home?.score ?? 0),
      awayScore: Number(away?.score ?? 0),
    };
  });
}

async function fetchEspnBoxScore(game: Game): Promise<GameLog[]> {
  const json = await espnJson<{ boxscore?: { players?: EspnBoxTeam[] } }>(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${game.gameId}`,
  );
  const teams = json.boxscore?.players ?? [];
  const rows: GameLog[] = [];
  for (const teamBlock of teams) {
    const team = nbaTricode(teamBlock.team?.abbreviation ?? "");
    const opp = team === game.home ? game.away : game.home;
    const isHome = team === game.home;
    const table = teamBlock.statistics?.[0];
    const keys = table?.keys ?? [];
    for (const row of table?.athletes ?? []) {
      if (row.didNotPlay || !row.stats?.length) continue;
      const min = espnStat(keys, row.stats, "minutes");
      const pts = espnStat(keys, row.stats, "points");
      if (!min && !pts) continue;
      rows.push({
        gameId: game.gameId,
        date: game.date,
        nbaId: Number(row.athlete?.id ?? 0),
        name: row.athlete?.displayName ?? "",
        team,
        matchup: `${team} ${isHome ? "vs." : "@"} ${opp}`,
        min: Math.round(min * 10) / 10,
        pts,
        reb: espnStat(keys, row.stats, "rebounds"),
        ast: espnStat(keys, row.stats, "assists"),
        stl: espnStat(keys, row.stats, "steals"),
        blk: espnStat(keys, row.stats, "blocks"),
        tov: espnStat(keys, row.stats, "turnovers"),
        fg3m: espnStat(keys, row.stats, "threePointFieldGoalsMade-threePointFieldGoalsAttempted"),
        live: game.status !== 3,
        fantraxId: null,
      });
    }
  }
  return rows;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        out[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 0 }, () => worker()));
  return out;
}

function hasCompleteFinal(logs: GameLog[], game: Game): boolean {
  const teams = new Set(
    logs.filter((l) => l.date === game.date && !l.live && (l.team === game.home || l.team === game.away)).map((l) => l.team),
  );
  return teams.has(game.home) && teams.has(game.away);
}

/**
 * Scoreboard + box scores for the current scoring period (including upcoming
 * scheduled games). ESPN is the live source that actually responds from Vercel.
 */
async function fetchEspnOverlay(
  seasonLogs: GameLog[],
  today: string,
): Promise<{ ok: boolean; games: Game[]; logs: GameLog[]; replacedDates: Set<string> }> {
  const period = getCurrentPeriod();
  const start = period ? etYmd(period.startDate) : today;
  const end = period ? etYmd(period.endDate) : today;
  const dates = eachEtDate(start, end);
  const boards = await Promise.allSettled(dates.map(async (date) => ({ date, games: await fetchEspnScoreboard(date) })));
  const ok = boards.some((b) => b.status === "fulfilled");

  const allGames: Game[] = [];
  const toBox: Game[] = [];
  const replacedDates = new Set<string>();

  for (const board of boards) {
    if (board.status === "rejected") {
      console.warn(`[nba] espn scoreboard failed: ${(board.reason as Error)?.message ?? board.reason}`);
      continue;
    }
    const { date, games } = board.value;
    allGames.push(...games);
    for (const game of games) {
      if (game.status < 2) continue;
      // Always refresh in-progress games. Skip completed slates we already have.
      if (game.status === 3 && hasCompleteFinal(seasonLogs, game)) continue;
      toBox.push(game);
      replacedDates.add(`${game.date}|${game.home}`);
      replacedDates.add(`${game.date}|${game.away}`);
    }
  }

  const boxes = await mapPool(toBox, 5, fetchEspnBoxScore);
  const logs: GameLog[] = [];
  boxes.forEach((r, i) => {
    if (r.status === "fulfilled") logs.push(...r.value);
    else {
      console.warn(`[nba] espn box failed for ${toBox[i].gameId}: ${(r.reason as Error)?.message ?? r.reason}`);
      replacedDates.delete(`${toBox[i].date}|${toBox[i].home}`);
      replacedDates.delete(`${toBox[i].date}|${toBox[i].away}`);
    }
  });

  return { ok, games: allGames, logs, replacedDates };
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
  /** Completed ESPN/NBA logs kept so later refreshes don't re-download finals. */
  completed: GameLog[];
  inflight: Promise<GameLogSnapshot> | null;
  lastError: string | null;
};

const g = globalThis as unknown as { __nbaLive?: LiveState };
const state: LiveState = (g.__nbaLive ??= {
  snapshot: null,
  snapshotAt: 0,
  season: null,
  completed: [],
  inflight: null,
  lastError: null,
});
state.completed ??= [];

function emptySnapshot(today: string): GameLogSnapshot {
  return { fetchedAt: null, season: SEASON, today, games: [], logs: [], source: "file" };
}

function baseCompletedLogs(): GameLog[] {
  if (state.completed.length) return state.completed;
  return (state.season?.logs ?? []).filter((l) => !l.live);
}

function rememberCompleted(logs: GameLog[]) {
  state.completed = logs.filter((l) => !l.live);
}

async function refresh(): Promise<GameLogSnapshot> {
  const now = Date.now();
  const today = todayEt();
  const seasonLogs = baseCompletedLogs();

  // stats.nba.com often hangs from cloud IPs — never block the live overlay on it.
  if (!state.season || now - state.season.at >= SEASON_TTL_MS) {
    void fetchSeasonGameLogs()
      .then((logs) => {
        state.season = { logs, at: Date.now() };
      })
      .catch((err: Error) => {
        console.warn(`[nba] season logs failed: ${err.message}`);
      });
  }

  let games: Game[] = [];
  let extraLogs: GameLog[] = [];
  let replacedDates = new Set<string>();
  let espnOk = false;
  try {
    const overlay = await fetchEspnOverlay(seasonLogs, today);
    games = overlay.games;
    extraLogs = overlay.logs;
    replacedDates = overlay.replacedDates;
    espnOk = overlay.ok;
  } catch (err) {
    console.warn(`[nba] espn overlay failed: ${(err as Error).message}`);
  }

  if (!espnOk) {
    try {
      games = await fetchScoreboard(today);
      const have = new Set(seasonLogs.map((l) => l.gameId));
      const pending = games.filter((g) => g.status >= 2 && !have.has(g.gameId));
      const boxes = await Promise.allSettled(pending.map((g) => fetchLiveBoxScore(g)));
      boxes.forEach((r, i) => {
        if (r.status === "fulfilled") extraLogs.push(...r.value);
        else console.warn(`[nba] box score failed for ${pending[i].gameId}: ${r.reason?.message ?? r.reason}`);
      });
    } catch (err) {
      console.warn(`[nba] nba scoreboard failed: ${(err as Error).message}`);
      games = state.snapshot?.games.filter((g) => g.date === today) ?? [];
    }
  }

  const logs = [
    ...seasonLogs.filter((l) => !replacedDates.has(`${l.date}|${nbaTricode(l.team)}`)),
    ...extraLogs,
  ];

  for (const l of logs) l.fantraxId = matchPlayer(l.name, l.team);
  logs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));
  rememberCompleted(logs);

  const live = espnOk || extraLogs.length > 0;
  return { fetchedAt: new Date().toISOString(), season: SEASON, today, games, logs, source: live ? "live" : "file" };
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
      return state.snapshot ?? emptySnapshot(todayEt());
    })
    .finally(() => {
      state.inflight = null;
    });
  return state.inflight;
}

/** Reuse an in-flight fetch, or a result that is only a couple of seconds old. */
const COALESCE_MS = 2_000;

/**
 * Current game logs. Always waits for a live fetch when the last result is
 * older than a couple of seconds, so router.refresh() on the 60s timer never
 * paints an hours-old snapshot.
 */
export async function getLiveGameLogs(): Promise<GameLogSnapshot> {
  if (state.inflight) return state.inflight;
  if (state.snapshot && Date.now() - state.snapshotAt < COALESCE_MS) return state.snapshot;
  return refreshInBackground();
}

export function getLiveStatus() {
  return { lastError: state.lastError, snapshotAt: state.snapshotAt, refreshing: state.inflight !== null };
}
