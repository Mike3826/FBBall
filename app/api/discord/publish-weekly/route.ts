import { NextResponse } from "next/server";
import { leagueInfo } from "@/lib/data";
import { buildWeeklyReportPayload, latestCompletedPeriod, publishWeeklyReport, weekIsComplete } from "@/lib/discord-weekly";
import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** Preview a weekly report. Defaults to the latest completed week. Nothing is sent. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const stats = await getStats();
  const requested = url.searchParams.get("period");
  const asked = requested && /^\d+$/.test(requested) ? leagueInfo.scoringPeriods.find((p) => p.number === Number(requested)) : undefined;
  const period =
    asked && stats.logsInPeriod(asked).length > 0 && weekIsComplete(stats, asked) ? asked : latestCompletedPeriod(stats);
  if (!period) return NextResponse.json({ ok: false, error: "No completed week is ready to publish" }, { status: 404 });
  const payload = buildWeeklyReportPayload(stats, period);
  return NextResponse.json({ ok: true, configured: Boolean(process.env.DISCORD_WEBHOOK_URL), ...payload });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { password?: unknown; period?: unknown } | null;
    if (body?.password !== "7777") {
      return NextResponse.json({ ok: false, error: "Wrong password" }, { status: 401 });
    }
    const period = typeof body?.period === "number" ? body.period : Number(body?.period);
    const result = await publishWeeklyReport(Number.isFinite(period) ? period : undefined);
    return NextResponse.json(result, { status: result.ok ? 200 : result.status === 429 ? 429 : 500 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
