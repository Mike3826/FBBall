// Weekly Discord report: slot leaders, bestball section scores, snubs, and
// one-player lineup moves. Uses the slot each manager started a player at.
import { formatShortDate, getCurrentPeriod, leagueInfo, playerMap, type ScoringPeriod } from "@/lib/data";
import { postWebhook, type PublishResult } from "@/lib/discord";
import { LINEUP_SLOTS, SLOTS, SLOT_LABEL, type Slot, type TeamLineup } from "@/lib/lineups";
import { buildTeamLineups } from "@/lib/lineups-build";
import { formatFp } from "@/lib/scoring";
import { datesInPeriod, getStats, type Stats } from "@/lib/stats";

const RAPTOR_RED = 0xce1141;
const GOLD = 0xb4975a;
const RANK = ["🥇", "🥈", "🥉"];
const SLOT_EMOJI: Record<Slot, string> = { G: "🇬", F: "🇫", C: "🇨" };
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null) ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
  "http://localhost:3000";

const r2 = (n: number) => Math.round(n * 100) / 100;

function nowEt(): string {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" });
}

function eligibleSlots(eligiblePos: string): Slot[] {
  return eligiblePos
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Slot => SLOTS.includes(s as Slot));
}

function sectionScore(t: TeamLineup, slot: Slot): number {
  return r2(t.groups[slot].filter((p) => p.counting).reduce((s, p) => s + p.fp, 0));
}

function slotLeaders(lineups: TeamLineup[], slot: Slot, limit = 3) {
  return lineups
    .flatMap((t) => t.groups[slot].map((p) => ({ ...p, teamName: t.team.name })))
    .sort((a, b) => b.fp - a.fp || b.games - a.games || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function sectionExtremes(lineups: TeamLineup[], slot: Slot) {
  const rows = lineups
    .map((t) => ({ team: t.team.name, fp: sectionScore(t, slot) }))
    .sort((a, b) => b.fp - a.fp || a.team.localeCompare(b.team));
  return { best: rows[0], worst: rows[rows.length - 1] };
}

function topSnub(lineups: TeamLineup[], slot: Slot) {
  return lineups
    .flatMap((t) => t.groups[slot].filter((p) => !p.counting).map((p) => ({ ...p, teamName: t.team.name })))
    .sort((a, b) => b.fp - a.fp || b.games - a.games || a.name.localeCompare(b.name))[0];
}

/** How many teams this score would crack as a counting G/F/C (top 6 / 6 / 3). */
function cutCount(lineups: TeamLineup[], slot: Slot, playerId: string, fp: number): { made: number; of: number } {
  const cap = LINEUP_SLOTS[slot];
  let made = 0;
  for (const t of lineups) {
    const rows = t.groups[slot].map((p) => ({ id: p.id, fp: p.fp }));
    if (!rows.some((p) => p.id === playerId)) rows.push({ id: playerId, fp });
    const rank = rows.sort((a, b) => b.fp - a.fp).findIndex((p) => p.id === playerId) + 1;
    if (rank > 0 && rank <= cap) made++;
  }
  return { made, of: lineups.length };
}

type LineupMove = {
  teamName: string;
  player: string;
  from: Slot;
  to: Slot;
  delta: number;
};

function bestballFromPools(pools: Record<Slot, { id: string; fp: number }[]>): number {
  let score = 0;
  for (const slot of SLOTS) {
    score += [...pools[slot]]
      .sort((a, b) => b.fp - a.fp)
      .slice(0, LINEUP_SLOTS[slot])
      .reduce((s, p) => s + p.fp, 0);
  }
  return r2(score);
}

function lineupMoves(lineups: TeamLineup[]): LineupMove[] {
  const moves: LineupMove[] = [];
  for (const t of lineups) {
    const pools: Record<Slot, { id: string; fp: number }[]> = {
      G: t.groups.G.map((p) => ({ id: p.id, fp: p.fp })),
      F: t.groups.F.map((p) => ({ id: p.id, fp: p.fp })),
      C: t.groups.C.map((p) => ({ id: p.id, fp: p.fp })),
    };
    const current = bestballFromPools(pools);
    for (const slot of SLOTS) {
      for (const p of t.groups[slot]) {
        for (const dest of eligibleSlots(p.eligiblePos).filter((s) => s !== slot)) {
          const next: Record<Slot, { id: string; fp: number }[]> = {
            G: pools.G.filter((row) => row.id !== p.id),
            F: pools.F.filter((row) => row.id !== p.id),
            C: pools.C.filter((row) => row.id !== p.id),
          };
          next[dest] = [...next[dest], { id: p.id, fp: p.fp }];
          const delta = r2(bestballFromPools(next) - current);
          if (delta >= 20) {
            moves.push({ teamName: t.team.name, player: p.name, from: slot, to: dest, delta });
          }
        }
      }
    }
  }
  return moves.sort((a, b) => b.delta - a.delta || a.teamName.localeCompare(b.teamName) || a.player.localeCompare(b.player));
}

function formatLeader(p: { name: string; fp: number; teamName: string; live: boolean }, index: number): string {
  const live = p.live ? " 🔴" : "";
  return `${RANK[index] ?? `${index + 1}.`} **${p.name}** · **${formatFp(p.fp)}**${live} · ${p.teamName}`;
}

export function weekIsComplete(stats: Stats, period: ScoringPeriod): boolean {
  const dates = new Set(datesInPeriod(period));
  if (stats.logsInPeriod(period).some((l) => l.live)) return false;
  const current = getCurrentPeriod();
  if (current && current.number === period.number) {
    return !stats.games.some((g) => dates.has(g.date) && g.status < 3);
  }
  return true;
}

/** Most recent scoring period that has logs and is fully final. */
export function latestCompletedPeriod(stats: Stats): ScoringPeriod | null {
  const done = leagueInfo.scoringPeriods.filter((p) => stats.logsInPeriod(p).length > 0 && weekIsComplete(stats, p));
  return done.at(-1) ?? null;
}

export type WeeklyReportPayload = {
  week: number;
  complete: boolean;
  count: number;
  headline: string;
  body: Record<string, unknown>;
};

export function buildWeeklyReportPayload(stats: Stats, period: ScoringPeriod): WeeklyReportPayload {
  const lineups = buildTeamLineups(stats, period);
  const complete = weekIsComplete(stats, period);
  const range = `${formatShortDate(period.startDate)} – ${formatShortDate(period.endDate)}`;
  const headline = `📊 Week ${period.number} Report`;
  const url = `${SITE_URL}/weekly-rankings?period=${period.number}`;

  const lines: string[] = [];
  if (!complete) lines.push(`🔴 **Live** as of ${nowEt()} ET`, "");

  for (const slot of SLOTS) {
    const top = slotLeaders(lineups, slot, 3);
    lines.push(`**${SLOT_EMOJI[slot]} ${SLOT_LABEL[slot]}**`);
    if (!top.length) lines.push("_No players scored_");
    else lines.push(...top.map((p, i) => formatLeader(p, i)));
    lines.push("");
  }

  lines.push("**🏀 Bestball**");
  for (const slot of SLOTS) {
    const { best, worst } = sectionExtremes(lineups, slot);
    if (!best || !worst) lines.push(`${SLOT_EMOJI[slot]} _no scores yet_`);
    else {
      lines.push(`${SLOT_EMOJI[slot]} **Best** · **${best.team}** · **${formatFp(best.fp)}**`);
      lines.push(`${SLOT_EMOJI[slot]} **Worst** · **${worst.team}** · **${formatFp(worst.fp)}**`);
    }
  }
  lines.push("");

  lines.push("**🚪 Missed The Cut**");
  for (const slot of SLOTS) {
    const snub = topSnub(lineups, slot);
    if (!snub) lines.push(`${SLOT_EMOJI[slot]} nobody missed the cut`);
    else {
      const { made, of } = cutCount(lineups, slot, snub.id, snub.fp);
      lines.push(
        `${SLOT_EMOJI[slot]} **${snub.name}** · **${formatFp(snub.fp)}** · ${snub.teamName} · would have made the cut on **${made}/${of}** teams`,
      );
    }
  }

  const moves = lineupMoves(lineups);
  const bestByTeam = new Map<string, LineupMove>();
  for (const m of moves) {
    if (!bestByTeam.has(m.teamName)) bestByTeam.set(m.teamName, m);
  }
  const shownMoves = [...bestByTeam.values()].sort((a, b) => b.delta - a.delta || a.teamName.localeCompare(b.teamName));
  if (shownMoves.length) {
    lines.push("", "**😬 Lineup Inefficiencies**");
    for (const m of shownMoves) {
      lines.push(
        `💸 **${m.teamName}** · **+${formatFp(m.delta)}** · ${m.player} at ${SLOT_EMOJI[m.to]} instead of ${SLOT_EMOJI[m.from]}`,
      );
    }
  }

  const topPlayer = SLOTS.flatMap((slot) => slotLeaders(lineups, slot, 3)).sort(
    (a, b) => b.fp - a.fp || b.games - a.games || a.name.localeCompare(b.name),
  )[0];
  const headshot = topPlayer ? playerMap[topPlayer.id]?.rotowireId : null;

  return {
    week: period.number,
    complete,
    count: lineups.reduce((n, t) => n + SLOTS.reduce((s, slot) => s + t.groups[slot].length, 0), 0),
    headline,
    body: {
      username: leagueInfo.leagueName,
      embeds: [
        {
          author: { name: `${leagueInfo.leagueName} · Week ${period.number}`, url },
          title: complete ? headline : `Live: ${headline}`,
          url,
          description: lines.join("\n").trim(),
          color: complete ? RAPTOR_RED : GOLD,
          thumbnail: headshot ? { url: `https://assets.rotowire.com/images/player/nba/${headshot}.png` } : undefined,
          footer: { text: `Week ${period.number}  •  ${range}  •  started slots` },
          timestamp: new Date().toISOString(),
        },
      ],
    },
  };
}

export async function publishWeeklyReport(periodNumber?: number): Promise<PublishResult & { week?: number }> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return { ok: false, error: "DISCORD_WEBHOOK_URL is not set in .env.local" };

  const stats = await getStats();
  const requested = periodNumber != null ? leagueInfo.scoringPeriods.find((p) => p.number === periodNumber) : undefined;
  const period =
    requested && stats.logsInPeriod(requested).length > 0 && weekIsComplete(stats, requested)
      ? requested
      : latestCompletedPeriod(stats);
  if (!period) return { ok: false, error: "No completed week is ready to publish" };

  const payload = buildWeeklyReportPayload(stats, period);
  const posted = await postWebhook(webhook, payload.body);
  if (!posted.ok) return posted;
  return { ok: true, date: `week-${period.number}`, count: payload.count, complete: true, week: period.number };
}
