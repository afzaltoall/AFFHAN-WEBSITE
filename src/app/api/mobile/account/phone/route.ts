import { NextResponse } from "next/server";
import { saveContactPhone } from "@/lib/contact-phone";

export const dynamic = "force-dynamic";

/**
 * The app saves the signed-in customer's mobile number: as typed, no code (lib/contact-phone.ts).
 *
 *   POST /api/mobile/account/phone/            with the slash, as the app's other calls
 *   Authorization: Bearer <session token>
 *   { "phone": "+919876543210" }               country code and digits; spaces and dashes are fine
 *
 *   200 { success: true, user: { id, name, email, phone, phoneVerified, authProvider, profileImage } }
 *   400 { error }   not a mobile number; `error` says what to fix, ready to show as it is
 *   401 { error }   no session, or it has ended
 *   409 { error }   another account has that number
 *   429 { error, reason: "rate_limited", retryAfterSeconds }   10 saves an hour per account
 *
 * phoneVerified stays false: the number is for our team to call or WhatsApp,
 * not a way to sign in. The app asks for one after Google sign-in when the
 * reply's user.phone is null (/api/mobile/auth/google, and /api/mobile/auth/me).
 */
export async function POST(request: Request) {
  try {
    const result = await saveContactPhone(request, "APP");
    if (!result.ok) return result.response;
    const { id, name, email, phone, phoneVerified, authProvider, profileImage } = result.user;
    return NextResponse.json({ success: true, user: { id, name, email, phone, phoneVerified, authProvider, profileImage } });
  } catch (error) {
    console.error("Mobile save phone error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
