import league from "@/data/league.json";
import standings from "@/data/standings.json";
import rosters from "@/data/rosters.json";
import draft from "@/data/draft.json";
import players from "@/data/players.json";

export type ScoringRule = {
  code: string;
  name: string;
  shortName: string;
  points: number;
};

export type Team = { id: string; name: string };

export type MatchupSide =
  | { name: string; id: string; shortName: string }
  | { bye: true }
  | { seed: number }
  | { TBD: true };

export type Matchup = { away: MatchupSide; home: MatchupSide };
export type MatchupPeriod = { period: number; matchupList: Matchup[] };

export type ScoringPeriod = { number: number; startDate: string; endDate: string };

export type Player = {
  id: string;
  name: string;
  nbaTeam: string;
  position: string;
  eligiblePos: string;
  status: string; // T = on a team, FA = free agent, WW = waiver wire
  rotowireId: number | null;
};

export type StandingRow = {
  teamName: string;
  totalPointsFor: number;
  teamId: string;
  gamesBack: number;
  rank: number;
  points: string; // W-L-T
  winPercentage: number;
};

export type RosterItem = { id: string; position: string; status: string };
export type RosterPlayer = Player & { rosterPosition: string; rosterStatus: string };

export type DraftPick = {
  round: number;
  pick: number;
  pickInRound: number;
  teamId: string;
  playerId: string;
  time: number;
};

export type LeagueInfo = {
  leagueId: string;
  leagueName: string;
  seasonYear: number;
  startDate: string;
  endDate: string;
  draftType: string;
  scoringType: string;
  scoring: ScoringRule[];
  rosterInfo: {
    positionConstraints: Record<string, { maxActive: number }>;
    maxTotalPlayers: number;
    maxTotalActivePlayers: number;
    maxTotalReservePlayers: number;
  };
  playoffs: {
    lastRegularSeasonPeriod: number;
    numPlayoffTeams: number;
    firstPlayoffPeriod: number;
    mergePlayoffPeriods: boolean;
    used: boolean;
  };
  teams: Team[];
  scoringPeriods: ScoringPeriod[];
  matchups: MatchupPeriod[];
};

export const leagueInfo = league as unknown as LeagueInfo;

export const playerMap = players as Record<string, Player>;
export const allPlayers: Player[] = Object.values(playerMap);

export const standingsRows = standings as StandingRow[];

export const draftResults = draft as {
  draftDate: string;
  draftState: string;
  draftType: string;
  draftOrder: string[];
  draftPicks: DraftPick[];
};

const rosterData = rosters as {
  period: number;
  rosters: Record<string, { teamName: string; rosterItems: RosterItem[] }>;
};

export const teams: Team[] = [...leagueInfo.teams].sort((a, b) =>
  a.name.localeCompare(b.name),
);

export function getTeam(teamId: string): Team | undefined {
  return leagueInfo.teams.find((t) => t.id === teamId);
}

export function getTeamName(teamId: string): string {
  return getTeam(teamId)?.name ?? "Unknown";
}

export function getRoster(teamId: string): RosterPlayer[] {
  const items = rosterData.rosters[teamId]?.rosterItems ?? [];
  return items
    .map((item) => {
      const p = playerMap[item.id];
      if (!p) return null;
      return { ...p, rosterPosition: item.position, rosterStatus: item.status };
    })
    .filter((p): p is RosterPlayer => p !== null)
    .sort((a, b) => {
      const order = { G: 0, F: 1, C: 2 } as Record<string, number>;
      const d = (order[a.rosterPosition] ?? 9) - (order[b.rosterPosition] ?? 9);
      return d !== 0 ? d : a.name.localeCompare(b.name);
    });
}

export function getDraftPick(playerId: string): DraftPick | undefined {
  return draftResults.draftPicks.find((p) => p.playerId === playerId);
}

/** Map of playerId -> teamId for rostered players. */
export const playerTeamMap: Record<string, string> = Object.fromEntries(
  Object.entries(rosterData.rosters).flatMap(([teamId, r]) =>
    r.rosterItems.map((item) => [item.id, teamId]),
  ),
);

export function getCurrentPeriod(now = new Date()): ScoringPeriod | undefined {
  const periods = leagueInfo.scoringPeriods;
  const found = periods.find(
    (p) => new Date(p.startDate) <= now && now <= new Date(p.endDate),
  );
  if (found) return found;
  if (now < new Date(periods[0].startDate)) return periods[0];
  return periods[periods.length - 1];
}

export function getMatchupsForPeriod(period: number): Matchup[] {
  return leagueInfo.matchups.find((m) => m.period === period)?.matchupList ?? [];
}

export function isTeamSide(side: MatchupSide): side is { name: string; id: string; shortName: string } {
  return "id" in side;
}

export function formatPlayerName(name: string): string {
  // Fantrax returns "Last, First" — flip it for display.
  const [last, first] = name.split(",").map((s) => s.trim());
  return first ? `${first} ${last}` : name;
}

/** Parse ISO strings; date-only values ("2026-10-20") are treated as local dates, not UTC. */
export function parseDate(iso: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);
}

export function formatDate(iso: string): string {
  return parseDate(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(iso: string): string {
  return parseDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const statusLabel: Record<string, string> = {
  T: "Rostered",
  FA: "Free Agent",
  WW: "Waivers",
};
