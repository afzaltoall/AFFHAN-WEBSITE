import { NextResponse } from "next/server";
import { verifyMobileSession } from "@/lib/mobile-auth";
import { tripApplicantId } from "@/lib/trip-applicant";
import { registrationById, registrationOf } from "@/lib/trip-participants";

export const dynamic = "force-dynamic";

/**
 * The visitor's own registration for the Free China Business Trip: whether
 * they have applied, and if so its Trip ID and when. Found by the signed-in
 * account, or by the browser that sent it (the applicant cookie,
 * lib/trip-applicant.ts: applying needs no account since 2026-10-28). The trip
 * pages read this to send someone who has already registered to their
 * boarding pass instead of a second application.
 *
 * 200 with registration: null for nobody (the same reasoning as
 * /api/web/auth/me: "nobody" is an answer, not an error).
 */
export async function GET(request: Request) {
  try {
    const user = await verifyMobileSession(request).catch(() => null);
    const registration = (user ? await registrationOf(user.id) : null) ?? (await registrationById(await tripApplicantId()));
    return NextResponse.json({ signedIn: !!user, registration });
  } catch (e) {
    console.error("trip registration lookup:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not check your registration." }, { status: 500 });
  }
}
