import { NextResponse } from "next/server";
import { normalisePhone } from "@/lib/mobile-otp";
import { authenticateByPhone } from "@/lib/phone-auth";
import { issueSignupToken } from "@/lib/signup-token";
import { markSessionAsWeb, publicUser, setSessionCookie } from "@/lib/web-session";

export const dynamic = "force-dynamic";

/**
 * Check the code and sign the visitor in.
 *
 * A number that already has an account gets a session immediately. A number
 * that does not gets a 409 carrying a signupToken — five minutes of proof that
 * this number was verified — so the modal can ask for a name and email without
 * a half-made account existing in the meantime, and without spending a second
 * Twilio verification on the same number.
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
      return NextResponse.json({ error: "Enter the code we sent you." }, { status: 400 });
    }

    // The browser form sends nothing but the number and the code, so an
    // unknown number always falls through to the 409 + signupToken path and
    // gets asked who it belongs to. The name and email are still forwarded for
    // the mobile app, which collects them on its own first screen and so can
    // finish a signup in a single call.
    const result = await authenticateByPhone({
      phone,
      code,
      firstName: body?.firstName,
      lastName: body?.lastName,
      email: body?.email,
    });

    if (!result.ok) {
      if (result.needsProfile) {
        return NextResponse.json(
          {
            needsProfile: true,
            signupToken: issueSignupToken(phone),
            error: "Almost there. Tell us your name to finish.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // phone-auth opened the session for both clients; label this one a browser
    // session, then hand the token over as a cookie the page cannot read.
    await markSessionAsWeb(result.rawToken);

    return setSessionCookie(
      NextResponse.json({ success: true, user: publicUser(result.user) }),
      { rawToken: result.rawToken, expiresAt: result.expiresAt }
    );
  } catch (error) {
    console.error("Web verify-otp error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
