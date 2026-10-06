import { NextResponse } from "next/server";
import { verifyMobileSession } from "@/lib/mobile-auth";
import { participantsSnapshot } from "@/lib/trip-participants";

export const dynamic = "force-dynamic";

/**
 * The participants board's figures: how many have registered for the Free
 * China Business Trip, from which countries, and the newest registrations by
 * Trip ID, country and time. Anonymous by design (lib/trip-participants.ts):
 * no name or contact detail of anyone leaves here.
 *
 * For signed-in visitors, like the trip's pages themselves; the viewer's own
 * row comes back marked as theirs.
 */
export async function GET(request: Request) {
  try {
    const user = await verifyMobileSession(request);
    if (!user) return NextResponse.json({ error: "Please sign in.", reason: "signin" }, { status: 401 });
    const snapshot = await participantsSnapshot(user.id);
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("trip participants:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not load the participants." }, { status: 500 });
  }
}
