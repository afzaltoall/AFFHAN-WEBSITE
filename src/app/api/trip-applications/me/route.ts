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
 * /api/web/auth/me: "nobody" is an answer, not an error). `byAccount`: the
 * registration is the signed-in account's own, not only this browser's (a
 * visit through an employee's link goes to a boarding pass only then,
 * ApplyExperience, 2026-11-05).
 */
export async function GET(request: Request) {
  try {
    const user = await verifyMobileSession(request).catch(() => null);
    const own = user ? await registrationOf(user.id) : null;
    const registration = own ?? (await registrationById(await tripApplicantId()));
    return NextResponse.json({ signedIn: !!user, registration, byAccount: !!own });
  } catch (e) {
    console.error("trip registration lookup:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not check your registration." }, { status: 500 });
  }
}
