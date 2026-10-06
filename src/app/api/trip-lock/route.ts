import { NextResponse } from "next/server";
import { tripLock } from "@/lib/trip-lock";

export const dynamic = "force-dynamic";

/**
 * Whether the trip is still locked (lib/trip-lock.ts). The homepage banner
 * and a locked trip page ask every ten seconds or so while it is locked, and
 * open the moment this says it is not; the door to the trip's pages asks on
 * every visit (proxy.ts).
 *
 * Kept at the edge for five seconds (s-maxage), so however many people are
 * watching when an admin unlocks it, the database hears about once every five
 * seconds per edge region, and every one of them sees it break within about
 * fifteen. max-age=0 keeps the browser itself from holding on to an answer.
 * Nothing private in it: never who changed it.
 */
export async function GET() {
  const lock = await tripLock();
  return NextResponse.json(
    { locked: lock.locked, unlockedAt: lock.unlockedAt },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=5" } },
  );
}
