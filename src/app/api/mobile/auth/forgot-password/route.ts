import { NextResponse, type NextRequest } from "next/server";
import { checkPasswordResetRateLimit, limitReached } from "@/lib/rate-limit";
import { requestPasswordResetCode } from "@/lib/password-reset-request";

export const dynamic = "force-dynamic";

/**
 * Ask for a password reset code, from the app.
 *
 *   POST /api/mobile/auth/forgot-password/      with the slash, as the app's other calls
 *   { "email": "name@example.com" }
 *
 *   200 { message }      the same sentence whatever happens (lib/password-reset-request.ts)
 *   200 { cannotSend… }  no code can be sent at all just now: WhatsApp and a phone number instead (lib/cannot-send.ts)
 *   429 { error, reason: "rate_limited", retryAfterSeconds }   per connection, one count with the website's
 *
 * The website's route asks for Turnstile first, which an app cannot show; nothing else differs. What holds
 * without it: the per-connection limit here, and the per-address limit inside issueEmailOtp, in the database,
 * which caps the codes any one inbox can be sent however many connections ask. The next two steps are the
 * website's own routes, which need no Turnstile: /api/web/auth/verify-reset-otp/ (email and code, for a reset
 * token) and /api/web/auth/reset-password/ (the token and the new password).
 */
export async function POST(request: NextRequest) {
  try {
    const limit = await checkPasswordResetRateLimit(request);
    if (!limit.success) return limitReached("There have been a lot of password-reset requests from this connection.", limit);

    const body = await request.json().catch(() => ({}));
    return await requestPasswordResetCode(body?.email, "mobile-forgot-password");
  } catch (error) {
    console.error("Mobile forgot password error:", error);
    // Even a crash answers the same way.
    return NextResponse.json({ message: "If that email is registered, we've sent a code to it." });
  }
}
