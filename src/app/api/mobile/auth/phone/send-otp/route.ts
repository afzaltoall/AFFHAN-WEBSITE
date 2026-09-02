import { NextResponse } from "next/server";
import { normalisePhone } from "@/lib/mobile-otp";
import { requestPhoneCode } from "@/lib/phone-auth";

export const dynamic = "force-dynamic";

/**
 * Ask Twilio Verify to text a code, for the app.
 *
 * Serves both flows: signup and login send the same request. Nothing here needs
 * to know which it is, because the code proves the number either way and the
 * verify step decides what to do with the result.
 *
 * The website's equivalent is /api/web/auth/phone/send-otp; both call the same
 * function in lib/phone-auth.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const phone = normalisePhone(body?.phone);

    if (!phone) {
      return NextResponse.json(
        { error: "Enter a valid mobile number with its country code." },
        { status: 400 }
      );
    }

    const result = await requestPhoneCode(phone);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.retryAfter ? { retryAfter: result.retryAfter } : {}) },
        {
          status: result.status,
          ...(result.retryAfter
            ? { headers: { "Retry-After": String(result.retryAfter) } }
            : {}),
        }
      );
    }

    return NextResponse.json({ sent: true, phone, resendAfter: result.resendAfter });
  } catch (error) {
    console.error("Send OTP Error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
