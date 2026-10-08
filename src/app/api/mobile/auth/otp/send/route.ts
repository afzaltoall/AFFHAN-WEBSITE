import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The app's first phone-code route, from before Twilio Verify. Its sender
 * (sendOtpSms in lib/mobile-otp.ts) is implemented for no provider, so it has
 * never delivered a code, and it now says so straight away.
 *
 * It used to write a code row first and only then fail to send. With a
 * site-wide cap on codes (lib/otp-caps.ts, security audit 2026-10-08, H7)
 * those rows would count against it, and anyone could use this route to
 * switch real codes off for the day. Codes go through
 * /api/mobile/auth/phone/send-otp (Twilio Verify, with the caps); bringing
 * this one back would mean sending it through requestPhoneCode as well.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Sign-in by text message is not available yet. Use email and password or Google." },
    { status: 501 } // Not Implemented
  );
}
