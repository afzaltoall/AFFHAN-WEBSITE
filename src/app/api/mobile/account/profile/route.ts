import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMobileSession } from "@/lib/mobile-auth";
import { checkProfileRateLimit, limitReached } from "@/lib/rate-limit";
import { recordAccountChanges } from "@/lib/account-audit";
import { addressLine, describeProfileProblems, profileInput, profileOf, profileUpdate } from "@/lib/account-profile";

export const dynamic = "force-dynamic";

/**
 * The signed-in customer's own details, for the app's "Complete your profile" (the owner, 2026-10-16).
 *
 *   GET   /api/mobile/account/profile/            with the slash, as the app's other calls
 *   PATCH /api/mobile/account/profile/
 *   Authorization: Bearer <session token>
 *   { "firstName"?, "lastName"?, "companyName"?, "address"?: { "line1"?, "line2"?, "city"?, "state"?, "postalCode"?, "country"? } }
 *         absent: left as it is; null or "": cleared
 *
 *   200 { user }                  GET: lib/account-profile.ts profileOf, as /api/mobile/auth/me
 *   200 { success: true, user }   PATCH: the details as saved
 *   400 { error, fields }         `error` says what to fix, ready to show as it is; `fields` by key ("address.city")
 *   401 { error }                 no session, or it has ended
 *   429 { error, reason: "rate_limited", retryAfterSeconds }   30 saves an hour per account
 *
 * The session decides whose details these are; nothing in the body can name another account. Email and phone
 * are not changed here: the phone has its own route (/api/mobile/account/phone/), with its own check and limit.
 */
export async function GET(request: Request) {
  try {
    const user = await verifyMobileSession(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    return NextResponse.json({ user: profileOf(user) });
  } catch (error) {
    console.error("Mobile profile read error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await verifyMobileSession(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const limit = await checkProfileRateLimit(user.id);
    if (!limit.success) return limitReached("You have saved your details a lot in the last hour.", limit);

    const body = await request.json().catch(() => ({}));
    const parsed = profileInput.safeParse(body ?? {});
    if (!parsed.success) return NextResponse.json(describeProfileProblems(parsed.error), { status: 400 });

    const update = profileUpdate(user, parsed.data);
    if (!update.ok) return NextResponse.json({ error: update.error, fields: { firstName: update.error } }, { status: 400 });
    if (Object.keys(update.data).length === 0) return NextResponse.json({ success: true, user: profileOf(user) });

    const updated = await prisma.mobileUser.update({ where: { id: user.id }, data: update.data });

    // Logged after the update, so nothing is recorded that did not happen; unchanged fields are skipped there.
    await recordAccountChanges(user.id, "APP", [
      { field: "name", from: user.name, to: updated.name },
      { field: "company", from: user.companyName, to: updated.companyName },
      {
        field: "address",
        from: addressLine({ line1: user.addressLine1, line2: user.addressLine2, city: user.city, state: user.state, postalCode: user.postalCode, country: user.country }),
        to: addressLine({ line1: updated.addressLine1, line2: updated.addressLine2, city: updated.city, state: updated.state, postalCode: updated.postalCode, country: updated.country }),
      },
    ]);

    return NextResponse.json({ success: true, user: profileOf(updated) });
  } catch (error) {
    console.error("Mobile profile save error:", error);
    return NextResponse.json({ error: "Could not save your details. Try again." }, { status: 500 });
  }
}
