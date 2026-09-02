import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMobileSession } from "@/lib/mobile-auth";
import { normalisePhone } from "@/lib/mobile-otp";
import { requestPhoneCode } from "@/lib/phone-auth";
import { checkVerification } from "@/lib/twilio-verify";
import { publicUser } from "@/lib/web-session";
import { recordAccountChanges } from "@/lib/account-audit";

export const dynamic = "force-dynamic";

/**
 * Attach a mobile number to the account that is already signed in.
 *
 * Someone who signed up with Google has no number, and the account page could
 * only tell them so. This is the way to add one — and the reason it is not a
 * field on that form is the whole point of this route: a number has to be
 * proved before it is stored.
 *
 * Two steps over one endpoint, chosen by `step`, because they are two halves
 * of one action and splitting them across routes would let the second be
 * reached without the first.
 *
 * The session decides whose account is changed. The body never names a user,
 * so a signed-in visitor can only ever add a number to themselves.
 */
export async function POST(request: Request) {
  try {
    const user = await verifyMobileSession(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const step = body?.step === "verify" ? "verify" : "send";
    const phone = normalisePhone(body?.phone);

    if (!phone) {
      return NextResponse.json({ error: "Enter a valid mobile number." }, { status: 400 });
    }

    // Checked before the code is sent as well as before it is stored. Texting
    // a code to a number that cannot be used either way is a wasted message
    // and a confusing dead end.
    const owner = await prisma.mobileUser.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (owner && owner.id !== user.id) {
      return NextResponse.json(
        { error: "That number is already on another Affhan account." },
        { status: 409 }
      );
    }

    if (step === "send") {
      const result = await requestPhoneCode(phone);
      if (!result.ok) {
        return NextResponse.json(
          {
            error: result.error,
            ...(result.retryAfter ? { cooldownSeconds: result.retryAfter } : {}),
          },
          { status: result.status }
        );
      }
      return NextResponse.json({ sent: true, cooldownSeconds: result.resendAfter });
    }

    // ---- verify ----
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!/^\d{4,10}$/.test(code)) {
      return NextResponse.json({ error: "Enter the code we sent you." }, { status: 400 });
    }

    const check = await checkVerification(phone, code);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.message },
        { status: check.reason === "unconfigured" ? 503 : 400 }
      );
    }

    const updated = await prisma.mobileUser.update({
      where: { id: user.id },
      data: {
        phone,
        phoneVerified: true,
        // Adding a number is adding a way in: this account can now sign in
        // with an OTP as well as with Google, and the provider string is what
        // the account page reads to say so.
        authProvider: user.authProvider.includes("PHONE")
          ? user.authProvider
          : `${user.authProvider}_AND_PHONE`,
      },
    });

    await recordAccountChanges(user.id, "WEB", [
      { field: "phone", from: user.phone, to: updated.phone },
    ]);

    return NextResponse.json({ success: true, user: publicUser(updated) });
  } catch (error) {
    console.error("Add phone error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
