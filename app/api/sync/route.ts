import { NextResponse } from "next/server";
import { invalidateRotowire } from "@/lib/rotowire";

export const dynamic = "force-dynamic";

/** Quiet background refresh for Rotowire player news. */
export async function POST() {
  invalidateRotowire();
  return NextResponse.json({ ok: true });
}
