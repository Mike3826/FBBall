import { NextResponse } from "next/server";
import { buildTopTenPayload, publishTopTen } from "@/lib/discord";
import { getStats, publishableDate } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** Preview: returns what POST would publish (no message is sent). `?date=YYYY-MM-DD` overrides the slate. */
export async function GET(req: Request) {
  const stats = await getStats();
  const requested = new URL(req.url).searchParams.get("date");
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : publishableDate(stats)?.date;
  if (!date) return NextResponse.json({ ok: false, error: "No games have been played yet" }, { status: 404 });
  const payload = buildTopTenPayload(stats, date);
  return NextResponse.json({ ok: true, configured: Boolean(process.env.DISCORD_WEBHOOK_URL), ...payload });
}

export async function POST() {
  try {
    const result = await publishTopTen();
    return NextResponse.json(result, { status: result.ok ? 200 : result.status === 429 ? 429 : 500 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
