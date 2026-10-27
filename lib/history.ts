import indexJson from "@/data/history/index.json";
import leagueHistoryJson from "@/data/history/league.json";
import logs2223 from "@/data/history/2022-23.json";
import logs2324 from "@/data/history/2023-24.json";
import logs2425 from "@/data/history/2024-25.json";
import logs2526 from "@/data/history/2025-26.json";
import {
  draftResults,
  formatPlayerName,
  getDraftPick,
  getTeamName,
  leagueInfo,
  playerMap,
  type Player,
  type ScoringRule,
} from "@/lib/data";
import { isNbaPostseasonGame, type GameLog } from "@/lib/nba";
import { fantasyPoints, isDoubleDouble, isTripleDouble } from "@/lib/scoring";
import { rankInFpList, shortMatchup, type FpRank, type ScoredLog } from "@/lib/stats";

export type HistorySeasonMeta = {
  season: string;
  seasonYear: number;
  leagueId: string;
  leagueName: string;
  startDate: string;
  endDate: string;
  scoring: ScoringRule[];
  teams: { id: string; name: string }[];
  champion: { teamId: string; teamName: string; points: string } | null;
  draftPicks: { playerId: string; teamId: string; round: number; pick: number; pickInRound: number; time: number }[];
};

type HistoryFile = {
  season: string;
  seasonYear: number;
  leagueId: string;
  cols: string[];
  players: Record<string, (string | number)[][]>;
};

const FILES: Record<string, HistoryFile> = {
  "2025-26": logs2526 as HistoryFile,
  "2024-25": logs2425 as HistoryFile,
  "2023-24": logs2324 as HistoryFile,
  "2022-23": logs2223 as HistoryFile,
};

const INDEX = indexJson as { fetchedAt: string; seasons: HistorySeasonMeta[] };

export type SeasonOption = {
  key: string;
  label: string;
  current: boolean;
  leagueId: string;
};

export function currentSeasonKey(): string {
  return `${leagueInfo.seasonYear}-${String(leagueInfo.seasonYear + 1).slice(-2)}`;
}

export function seasonOptions(): SeasonOption[] {
  return [
    { key: currentSeasonKey(), label: currentSeasonKey(), current: true, leagueId: leagueInfo.leagueId },
    ...INDEX.seasons.map((s) => ({
      key: s.season,
      label: s.season,
      current: false,
      leagueId: s.leagueId,
    })),
  ];
}

export function historyMeta(season: string): HistorySeasonMeta | undefined {
  return INDEX.seasons.find((s) => s.season === season);
}

export function scoringForSeason(season: string): ScoringRule[] {
  const rules = historyMeta(season)?.scoring ?? [];
  return rules.length > 0 ? rules : leagueInfo.scoring;
}

export function historyDraftPick(playerId: string, season: string) {
  return historyMeta(season)?.draftPicks.find((p) => p.playerId === playerId);
}

export type DynastyDraftPick = {
  season: string;
  type: "startup" | "rookie";
  date: string | null;
  time: number | null;
  round: number;
  pick: number;
  pickInRound: number;
  teamId: string;
  teamName: string;
};

/** The player's original dynasty draft pick, regardless of which season is being viewed. */
export function dynastyDraftPick(playerId: string): DynastyDraftPick | undefined {
  const current = getDraftPick(playerId);
  if (current) {
    return {
      season: currentSeasonKey(),
      type: "rookie",
      date: draftResults.draftDate,
      time: current.time,
      round: current.round,
      pick: current.pick,
      pickInRound: current.pickInRound,
      teamId: current.teamId,
      teamName: getTeamName(current.teamId),
    };
  }
  for (const season of leagueHistorySeasons()) {
    const pick = season.draft.picks.find((p) => p.playerId === playerId);
    if (!pick) continue;
    const timed = historyDraftPick(playerId, season.season);
    return {
      season: season.season,
      type: season.draft.type,
      date: season.draft.date,
      time: timed?.time ?? null,
      round: pick.round,
      pick: pick.pick,
      pickInRound: pick.pickInRound,
      teamId: pick.teamId,
      teamName: pick.teamName,
    };
  }
}

export function historyTeamName(season: string, teamId: string): string {
  return historyMeta(season)?.teams.find((t) => t.id === teamId)?.name ?? teamId;
}

function rowToLog(playerId: string, row: (string | number)[]): GameLog {
  return {
    date: String(row[0]),
    gameId: String(row[1]),
    team: String(row[2]),
    matchup: String(row[3]),
    min: Number(row[4]) || 0,
    pts: Number(row[5]) || 0,
    reb: Number(row[6]) || 0,
    ast: Number(row[7]) || 0,
    stl: Number(row[8]) || 0,
    blk: Number(row[9]) || 0,
    tov: Number(row[10]) || 0,
    fg3m: Number(row[11]) || 0,
    nbaId: 0,
    name: formatPlayerName(historyPlayerName(playerId)),
    live: false,
    fantraxId: playerId,
  };
}

const seasonFpCache = new Map<string, { id: string; fp: number }[]>();

function historySeasonFpTotals(season: string): { id: string; fp: number }[] {
  const hit = seasonFpCache.get(season);
  if (hit) return hit;
  const file = FILES[season];
  if (!file) {
    seasonFpCache.set(season, []);
    return [];
  }
  const rules = scoringForSeason(season);
  const totals: { id: string; fp: number }[] = [];
  for (const [id, rows] of Object.entries(file.players)) {
    if (!rows.length) continue;
    let fp = 0;
    let games = 0;
    for (const row of rows) {
      if (isNbaPostseasonGame(String(row[1]))) continue;
      fp += fantasyPoints(rowToLog(id, row), rules);
      games++;
    }
    if (!games) continue;
    totals.push({ id, fp: Math.round(fp * 100) / 100 });
  }
  totals.sort((a, b) => b.fp - a.fp || a.id.localeCompare(b.id));
  seasonFpCache.set(season, totals);
  return totals;
}

export function historySeasonFpRank(playerId: string, season: string): FpRank | null {
  return rankInFpList(historySeasonFpTotals(season), (row) => row.id === playerId, (row) => row.fp);
}

export function getHistoryLogs(playerId: string, season: string): ScoredLog[] {
  const file = FILES[season];
  const rules = scoringForSeason(season);
  const rows = (file?.players[playerId] ?? []).filter((row) => !isNbaPostseasonGame(String(row[1])));
  const fx = resolvePlayer(playerId);
  return rows.map((row) => {
    const log = rowToLog(playerId, row);
    return {
      ...log,
      fp: fantasyPoints(log, rules),
      dd: isDoubleDouble(log),
      td: isTripleDouble(log),
      displayName: fx ? formatPlayerName(fx.name) : log.name,
      fantasyTeamId: null,
      fantasyTeamName: null,
      ownerStatus: (fx?.status === "WW" ? "WW" : fx?.status === "T" ? "T" : "FA") as ScoredLog["ownerStatus"],
      opponent: shortMatchup(log.matchup, log.team),
    };
  });
}

export function resolveSeason(requested: string | undefined): SeasonOption {
  const options = seasonOptions();
  return options.find((s) => s.key === requested) ?? options[0];
}

export type HistoryMatchup = {
  homeId: string | null;
  homeName: string | null;
  homeScore: number | null;
  awayId: string | null;
  awayName: string | null;
  awayScore: number | null;
  bye: boolean;
};

export type HistoryRound = {
  caption: string;
  subCaption: string;
  matchups: HistoryMatchup[];
};

export type HistoryStanding = {
  rank: number;
  teamId: string;
  teamName: string;
  record: string;
  winPercentage: number;
  pointsFor?: number;
  gamesBack: number;
};

export type HistoryRosterPlayer = {
  id: string;
  name: string;
  nbaTeam: string;
  position: string;
  eligiblePos: string;
  rosterPosition: string;
  status: string;
};

export type HistoryDraftPick = {
  playerId: string;
  name: string;
  nbaTeam: string;
  position: string;
  teamId: string;
  teamName: string;
  round: number;
  pick: number;
  pickInRound: number;
};

export type HistorySlot = { slot: string; maxActive: number };

export type HistoryLeagueSeason = {
  season: string;
  seasonYear: number;
  leagueId: string;
  leagueName: string;
  startDate: string;
  endDate: string;
  seasonNumber: number;
  format: "categories" | "points";
  formatLabel: string;
  scoringType?: string;
  slots: HistorySlot[];
  categories: string[];
  playoffs: { numPlayoffTeams: number; firstPlayoffPeriod: number; lastRegularSeasonPeriod: number } | null;
  rosterPeriod: number | null;
  champion: { teamId: string; teamName: string } | null;
  standings: HistoryStanding[];
  rounds: HistoryRound[];
  draft: { type: "startup" | "rookie"; date: string | null; picks: HistoryDraftPick[] };
  rosters: Record<string, { teamName: string; players: HistoryRosterPlayer[] }>;
};

const CAT_SLOTS: HistorySlot[] = [
  { slot: "PG", maxActive: 2 },
  { slot: "SG", maxActive: 2 },
  { slot: "G", maxActive: 1 },
  { slot: "SF", maxActive: 2 },
  { slot: "PF", maxActive: 2 },
  { slot: "F", maxActive: 1 },
  { slot: "C", maxActive: 2 },
  { slot: "Flx", maxActive: 3 },
];

const CAT_STATS = ["PTS", "REB", "AST", "ST", "BLK", "3PTM", "TO", "FG%", "FT%"];

function withFormat(season: HistoryLeagueSeason): HistoryLeagueSeason {
  const categories = season.seasonYear === 2022;
  return {
    ...season,
    seasonNumber: season.seasonNumber ?? (categories ? 1 : season.seasonYear - 2021),
    format: season.format ?? (categories ? "categories" : "points"),
    formatLabel: season.formatLabel ?? (categories ? "9-category" : "Points"),
    slots: season.slots?.length ? season.slots : categories ? CAT_SLOTS : [{ slot: "Flx", maxActive: 31 }],
    categories: season.categories?.length ? season.categories : categories ? CAT_STATS : [],
    draft: season.draft ?? { type: categories ? "startup" : "rookie", date: null, picks: [] },
  };
}

const LEAGUE_HISTORY = leagueHistoryJson as unknown as { fetchedAt: string; seasons: HistoryLeagueSeason[] };

type HistoryName = { name: string; nbaTeam: string; position: string };

function usableHistoryTeam(team: string | undefined) {
  return Boolean(team && team !== "(N/A)");
}

function usableHistoryPos(pos: string | undefined) {
  return Boolean(pos && pos !== "Flx");
}

function rememberHistoryName(index: Map<string, HistoryName>, id: string, name: string, nbaTeam: string, position: string) {
  if (!id || !name || name === "Unknown") return;
  const prev = index.get(id);
  if (!prev) {
    index.set(id, { name, nbaTeam: nbaTeam ?? "", position: position ?? "" });
    return;
  }
  if (!usableHistoryTeam(prev.nbaTeam) && usableHistoryTeam(nbaTeam)) prev.nbaTeam = nbaTeam;
  if (!usableHistoryPos(prev.position) && usableHistoryPos(position)) prev.position = position;
}

let historyNames: Map<string, HistoryName> | null = null;

function historyNameIndex(): Map<string, HistoryName> {
  if (historyNames) return historyNames;
  const index = new Map<string, HistoryName>();
  for (const [id, p] of Object.entries(playerMap)) {
    rememberHistoryName(index, id, p.name, p.nbaTeam, p.position);
  }
  for (const season of LEAGUE_HISTORY.seasons) {
    for (const p of season.draft?.picks ?? []) {
      rememberHistoryName(index, p.playerId, p.name, p.nbaTeam, p.position);
    }
    for (const roster of Object.values(season.rosters ?? {})) {
      for (const p of roster.players ?? []) {
        rememberHistoryName(index, p.id, p.name, p.nbaTeam, p.position);
      }
    }
  }
  historyNames = index;
  return index;
}

/** Name for a historical player, including retirees Fantrax no longer lists. */
export function historyPlayerName(id: string, fallback = ""): string {
  if (fallback && fallback !== "Unknown") return fallback;
  return playerMap[id]?.name ?? historyNameIndex().get(id)?.name ?? (fallback || "Unknown");
}

export type ResolvedPlayer = Player & { historical?: boolean };

/** Current pool player, or a retired/historical player from past rosters and drafts. */
export function resolvePlayer(id: string): ResolvedPlayer | undefined {
  const current = playerMap[id];
  if (current) return current;
  const hist = historyNameIndex().get(id);
  if (!hist) return undefined;
  return {
    id,
    name: hist.name,
    nbaTeam: hist.nbaTeam || "(N/A)",
    position: hist.position || "",
    eligiblePos: hist.position || "",
    status: "FA",
    rotowireId: null,
    historical: true,
  };
}

export function playerAppearedInSeason(id: string, season: string): boolean {
  if (FILES[season]?.players[id]?.length) return true;
  const s = LEAGUE_HISTORY.seasons.find((row) => row.season === season);
  if (!s) return false;
  if (s.draft?.picks.some((p) => p.playerId === id)) return true;
  return Object.values(s.rosters ?? {}).some((roster) => roster.players.some((p) => p.id === id));
}

/** Current season for pool players; otherwise the most recent historical season they appeared in. */
export function preferredSeasonForPlayer(id: string): SeasonOption {
  const options = seasonOptions();
  if (playerMap[id]) return options[0];
  return options.find((s) => !s.current && playerAppearedInSeason(id, s.key)) ?? options[0];
}

export function historyRosterTeam(playerId: string, season: string): { teamId: string; teamName: string } | null {
  const s = LEAGUE_HISTORY.seasons.find((row) => row.season === season);
  if (!s) return null;
  for (const [teamId, roster] of Object.entries(s.rosters ?? {})) {
    if (roster.players.some((p) => p.id === playerId)) return { teamId, teamName: roster.teamName };
  }
  return null;
}

export function leagueHistorySeasons(): HistoryLeagueSeason[] {
  return LEAGUE_HISTORY.seasons.map(withFormat);
}

export function leagueHistorySeason(key: string | undefined): HistoryLeagueSeason {
  return leagueHistorySeasons().find((s) => s.season === key) ?? leagueHistorySeasons()[0];
}
