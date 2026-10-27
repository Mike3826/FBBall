// Builds and posts the daily "Top 10" to a Discord channel via webhook.
//
// Discord embeds wrap long lines (especially on mobile), so this avoids wide
// monospace tables and uses native markdown instead: one bold headline per
// player with a small-text (-#) stat line underneath.
import { getCurrentPeriod, leagueInfo, playerMap } from "@/lib/data";
import { formatFp } from "@/lib/scoring";
import { getStats, publishableDate, type ScoredLog, type Stats } from "@/lib/stats";

const RAPTOR_RED = 0xce1141;
const GOLD = 0xb4975a;
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null) ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
  "http://localhost:3000";

const RANK = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

function longDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function nowEt(): string {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" });
}

/** "38 PTS · 5 REB · 3 AST · 5 STL · 7 3PM · 3 TO" — zero stats in the minor categories are omitted. */
function statLine(r: ScoredLog): string {
  const parts = [`${r.pts} PTS`, `${r.reb} REB`, `${r.ast} AST`];
  if (r.stl) parts.push(`${r.stl} STL`);
  if (r.blk) parts.push(`${r.blk} BLK`);
  if (r.fg3m) parts.push(`${r.fg3m} 3PM`);
  if (r.tov) parts.push(`${r.tov} TO`);
  return parts.join(" · ");
}

function ownerLabel(r: ScoredLog): string {
  if (r.fantasyTeamName) return r.fantasyTeamName;
  return r.ownerStatus === "WW" ? "Waivers" : "Free Agent";
}

export function formatPlayerEntry(r: ScoredLog, index: number): string {
  const badges = [r.td ? "🔥 TD" : r.dd ? "DD" : null, r.live ? "🔴 LIVE" : null].filter(Boolean).join(" · ");
  const matchup = `${r.team} ${r.opponent.replace(/^@/, "@ ")}`;
  const headline = `${RANK[index] ?? `**${index + 1}.**`} **${r.displayName}** · ${matchup} · **${formatFp(r.fp)}**${badges ? ` · ${badges}` : ""}`;
  const detail = `-# ${statLine(r)} — ${ownerLabel(r)}`;
  return `${headline}\n${detail}`;
}

export type TopTenPayload = {
  date: string;
  complete: boolean;
  count: number;
  headline: string;
  body: Record<string, unknown>;
};

export function buildTopTenPayload(stats: Stats, date: string, limit = 10): TopTenPayload {
  const leaders = stats.dailyLeaders(date);
  const top = leaders.slice(0, limit);

  // In progress if any box score is live, or (for today) any scheduled game hasn't gone final.
  const games = stats.games.filter((g) => g.date === date);
  const liveGames = games.filter((g) => g.status === 2).length;
  const pendingGames = games.filter((g) => g.status === 1).length;
  const complete = !leaders.some((l) => l.live) && liveGames + pendingGames === 0;

  const lines: string[] = [];
  if (!complete) {
    const bits = [liveGames && `${liveGames} game${liveGames === 1 ? "" : "s"} live`, pendingGames && `${pendingGames} not started`].filter(Boolean);
    lines.push(`🔴 **Live snapshot** as of ${nowEt()} ET${bits.length ? ` · ${bits.join(" · ")}` : ""}`, "");
  }
  lines.push(top.map(formatPlayerEntry).join("\n\n"));

  const leader = top[0];
  const headline = longDate(date);
  const headshot = leader?.fantraxId ? playerMap[leader.fantraxId]?.rotowireId : null;
  const period = getCurrentPeriod(new Date(`${date}T12:00:00`));
  const dd = leaders.filter((l) => l.dd).length;
  const td = leaders.filter((l) => l.td).length;
  const footerBits = [
    period && `Week ${period.number}`,
    `${leaders.length} players scored`,
    dd && `${dd} double-double${dd === 1 ? "" : "s"}`,
    td && `${td} triple-double${td === 1 ? "" : "s"}`,
  ].filter(Boolean);

  return {
    date,
    complete,
    count: top.length,
    headline,
    body: {
      username: leagueInfo.leagueName,
      embeds: [
        {
          author: { name: `${leagueInfo.leagueName} · ${longDate(date)}`, url: `${SITE_URL}/daily-rankings` },
          title: complete ? headline : `Live: ${headline}`,
          url: `${SITE_URL}/daily-rankings?date=${date}`,
          description: lines.join("\n"),
          color: complete ? RAPTOR_RED : GOLD,
          thumbnail: headshot ? { url: `https://assets.rotowire.com/images/player/nba/${headshot}.png` } : undefined,
          footer: { text: footerBits.join("  •  ") },
          timestamp: new Date().toISOString(),
        },
      ],
    },
  };
}

export type PublishResult =
  | { ok: true; date: string; count: number; complete: boolean }
  | { ok: false; error: string; status?: number };

async function postWebhook(webhook: string, body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Discord responded ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`, status: res.status };
  }
  return { ok: true };
}

/**
 * Posts the top-10 table to the configured webhook: the latest completed slate,
 * or today's in-progress slate if nothing has finished yet.
 */
export async function publishTopTen(): Promise<PublishResult> {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return { ok: false, error: "DISCORD_WEBHOOK_URL is not set in .env.local" };

  const stats = await getStats();
  const target = publishableDate(stats);
  if (!target) return { ok: false, error: "No games have been played yet" };

  const payload = buildTopTenPayload(stats, target.date);
  if (payload.count === 0) return { ok: false, error: `No player stats for ${target.date}` };

  const posted = await postWebhook(webhook, payload.body);
  if (!posted.ok) return posted;
  return { ok: true, date: target.date, count: payload.count, complete: payload.complete };
}
