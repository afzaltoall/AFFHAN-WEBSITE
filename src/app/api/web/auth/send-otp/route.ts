import { NextResponse } from "next/server";
import { normalisePhone } from "@/lib/mobile-otp";
import { requestPhoneCode } from "@/lib/phone-auth";

export const dynamic = "force-dynamic";

/** Text a code to the number the visitor typed. Same logic the app uses. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const phone = normalisePhone(body?.phone);

    if (!phone) {
      return NextResponse.json({ error: "Enter a valid mobile number." }, { status: 400 });
    }

    const result = await requestPhoneCode(phone);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, ...(result.retryAfter ? { cooldownSeconds: result.retryAfter } : {}) },
        {
          status: result.status,
          ...(result.retryAfter ? { headers: { "Retry-After": String(result.retryAfter) } } : {}),
        }
      );
    }

    // The client's resend timer counts down from a number the server owns,
    // rather than one hardcoded in the modal that could drift from the rule.
    return NextResponse.json({ success: true, cooldownSeconds: result.resendAfter });
  } catch (error) {
    console.error("Web send-otp error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
