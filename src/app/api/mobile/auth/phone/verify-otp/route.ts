import { NextResponse } from "next/server";
import { normalisePhone } from "@/lib/mobile-otp";
import { authenticateByPhone } from "@/lib/phone-auth";
import { markSessionPlatform } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

/**
 * Phone sign-in for the app. The shared logic lives in lib/phone-auth; this
 * route's only job is to hand the token back as JSON, which is what the app
 * puts in flutter_secure_storage.
 *
 * The website's equivalent is /api/web/auth/phone/verify-otp, which runs the
 * same function and sets an httpOnly cookie instead.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const phone = normalisePhone(body?.phone);
    const code = typeof body?.code === "string" ? body.code.trim() : "";

    if (!phone) {
      return NextResponse.json({ error: "Enter a valid mobile number." }, { status: 400 });
    }
    if (!/^\d{4,10}$/.test(code)) {
      return NextResponse.json({ error: "Enter the code from the message." }, { status: 400 });
    }

    const result = await authenticateByPhone({
      phone,
      code,
      firstName: body?.firstName,
      lastName: body?.lastName,
      email: body?.email,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          ...(result.needsProfile ? { needsProfile: true } : {}),
          ...(result.reason ? { reason: result.reason } : {}),
        },
        { status: result.status }
      );
    }

    // phone-auth opened the session for both clients; label this one an app
    // session so the admin lists can tell the two apart.
    await markSessionPlatform(result.rawToken, "APP");

    return NextResponse.json({ token: result.rawToken, user: result.user });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
