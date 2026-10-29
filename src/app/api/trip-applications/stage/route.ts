import { NextResponse } from "next/server";
import { TRIP_LOCKED_ERROR, tripClosedHere } from "@/lib/trip-lock";
import { tripStage } from "@/lib/trip-stage";

export const dynamic = "force-dynamic";

/**
 * How far the Free China Business Trip has got, as the team sets it in the
 * console (lib/trip-stage.ts): "What happens next" on the registered page
 * follows it, and it is that page's one live figure. How many have applied,
 * from where and who came last are no longer shown to anyone outside the
 * console (the owner, 2026-10-28), so this says nothing about any
 * application. Open to everyone, as the trip's pages are; closed with the rest
 * of the trip while it is locked.
 */
export async function GET() {
  try {
    if (await tripClosedHere()) return NextResponse.json({ error: TRIP_LOCKED_ERROR, reason: "locked" }, { status: 403 });
    const { stage } = await tripStage();
    return NextResponse.json({ stage }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("trip stage:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not load the trip's progress." }, { status: 500 });
  }
}
