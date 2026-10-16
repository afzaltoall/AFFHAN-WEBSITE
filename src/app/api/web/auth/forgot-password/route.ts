import { NextResponse, type NextRequest } from "next/server";
import { checkPasswordResetRateLimit, getClientIp, limitReached } from "@/lib/rate-limit";
import { checkTurnstile } from "@/lib/turnstile";
import { requestPasswordResetCode } from "@/lib/password-reset-request";

export const dynamic = "force-dynamic";

/**
 * Ask for a password reset code, on the website: Turnstile, then the per-connection limit, then the part the app's
 * route shares (lib/password-reset-request.ts), whose answer is the same sentence whatever happens.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // Turnstile first, before the limit is spent or anything read (2026-10-09).
    // It says nothing about the address either way.
    const human = await checkTurnstile(body?.turnstileToken, getClientIp(request));
    if (!human.ok) return NextResponse.json({ error: human.error }, { status: human.status });

    // Per connection. Fails open (lib/limit-policy.ts): the per-address limit
    // is inside issueEmailOtp, in the database, and holds with or without
    // Upstash.
    const limit = await checkPasswordResetRateLimit(request);
    if (!limit.success) return limitReached("There have been a lot of password-reset requests from this connection.", limit);

    return await requestPasswordResetCode(body?.email, "forgot-password");
  } catch (error) {
    console.error("Forgot password error:", error);
    // Even a crash answers the same way.
    return NextResponse.json({ message: "If that email is registered, we've sent a code to it." });
  }
}
