import transactionsJson from "@/data/transactions.json";
import { formatPlayerName, getTeam, playerMap } from "@/lib/data";

export type Move = {
  teamId: string | null;
  teamName: string | null;
  fromTeamId?: string | null;
  fromTeamName?: string | null;
  action: string;
  actionLabel?: string;
  playerId: string | null;
  playerName: string | null;
  nbaTeam: string | null;
  pos: string | null;
  bid?: string | null;
  note: string | null;
  executed?: boolean;
};

export type Transaction = {
  id: string;
  date: string | null;
  dateText: string | null;
  week?: number | string | null;
  season?: string;
  leagueId?: string;
  type: string; // TRADE | FA | WAIVER | CLAIM | DROP | MULTI | ...
  teams: string[];
  moves: Move[];
};

export const transactionsFile = transactionsJson as {
  fetchedAt: string | null;
  leagueId: string;
  seasons?: string[];
  transactions: Transaction[];
};

export const transactions = transactionsFile.transactions;

export function transactionSeasons(): string[] {
  const fromFile = transactionsFile.seasons ?? [];
  const fromRows = transactions.map((t) => t.season).filter((s): s is string => Boolean(s));
  return [...new Set([...fromFile, ...fromRows])].sort((a, b) => b.localeCompare(a));
}

export function playerLabel(m: Move): string {
  if (m.playerId && playerMap[m.playerId]) {
    const p = playerMap[m.playerId];
    return `${formatPlayerName(p.name)} (${p.nbaTeam})`;
  }
  if (m.playerName) return `${m.playerName}${m.nbaTeam ? ` (${m.nbaTeam})` : ""}`;
  return m.note ?? "—";
}

export function teamLabel(m: Move): string {
  return (m.teamId && getTeam(m.teamId)?.name) || m.teamName || "Unknown";
}

export function currentTeamId(teamId: string | null | undefined): string | null {
  return teamId && getTeam(teamId) ? teamId : null;
}

export function transactionTime(t: Transaction): string {
  if (t.date) {
    return new Date(t.date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return t.dateText ?? "";
}

export const ACTION_STYLE: Record<string, string> = {
  ADD: "bg-emerald-500/15 text-emerald-300",
  FA: "bg-emerald-500/15 text-emerald-300",
  CLAIM: "bg-emerald-500/15 text-emerald-300",
  WAIVER: "bg-amber-500/15 text-amber-300",
  DROP: "bg-rose-500/15 text-rose-300",
  TRADE: "bg-orange/20 text-orange-soft",
};

export const ACTION_LABEL: Record<string, string> = {
  FA: "FA Add",
  WAIVER: "Waiver Claim",
  CLAIM: "Claim",
  DROP: "Drop",
  ADD: "Add",
  TRADE: "Trade",
};

export function actionLabel(m: Move): string {
  return ACTION_LABEL[m.action] ?? m.actionLabel ?? m.action;
}

/** Every transaction involving a player, newest first, with the moves that reference that player. */
export function getPlayerTransactions(playerId: string): { transaction: Transaction; move: Move }[] {
  const out: { transaction: Transaction; move: Move }[] = [];
  for (const t of transactions) {
    for (const m of t.moves) {
      if (m.playerId === playerId) out.push({ transaction: t, move: m });
    }
  }
  return out;
}
