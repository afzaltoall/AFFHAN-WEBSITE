import { NextResponse } from "next/server";
import { verifyMobileSession } from "@/lib/mobile-auth";
import { registrationOf } from "@/lib/trip-participants";

export const dynamic = "force-dynamic";

/**
 * The signed-in account's own registration for the Free China Business Trip:
 * whether it has applied, and if so its Trip ID and when. The trip pages read
 * this to send someone who has already registered to the participants board
 * instead of a second application.
 *
 * 200 with signedIn: false for nobody signed in (the same reasoning as
 * /api/web/auth/me: "nobody" is an answer, not an error).
 */
export async function GET(request: Request) {
  try {
    const user = await verifyMobileSession(request);
    if (!user) return NextResponse.json({ signedIn: false, registration: null });
    return NextResponse.json({ signedIn: true, registration: await registrationOf(user.id) });
  } catch (e) {
    console.error("trip registration lookup:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not check your registration." }, { status: 500 });
  }
}
