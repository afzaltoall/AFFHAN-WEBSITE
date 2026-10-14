import { NextResponse, type NextRequest } from "next/server";
import { checkPasswordResetRateLimit } from "@/lib/rate-limit";
import { checkEmailOtp } from "@/lib/email-otp";
import { issueResetToken } from "@/lib/reset-token";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Check the code and hand back a short-lived token.
 *
 * Unlike the request step, this one does answer honestly — a customer typing a
 * code needs to know whether it was wrong, expired, or spent. It gives nothing
 * away that the previous step did not: to get here you already have to hold a
 * code, and codes only reach the inbox they were issued for.
 *
 * The wrong-code answer is deliberately one message for several situations —
 * no code outstanding, expired, wrong digits. Naming which would tell someone
 * guessing whether an address has a live code waiting, which is the one thing
 * worth knowing here.
 */
export async function POST(request: NextRequest) {
  try {
    const limit = await checkPasswordResetRateLimit(request);
    if (!limit.success) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again in a few minutes." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter the email you used." }, { status: 400 });
    }
    if (!/^\d{4,10}$/.test(code)) {
      return NextResponse.json({ error: "Enter the code we sent you." }, { status: 400 });
    }

    const result = await checkEmailOtp(email, "PASSWORD_RESET", code);

    if (!result.ok) {
      if (result.reason === "too_many_attempts") {
        return NextResponse.json(
          { error: "Too many wrong codes. Ask for a new one." },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: "That code is wrong or has expired. Ask for a new one." },
        { status: 400 }
      );
    }

    // Ten minutes to choose a password, and tied to the code that was just
    // accepted so it can be spent exactly once. See lib/reset-token.ts.
    return NextResponse.json({ resetToken: issueResetToken(email, result.otpId) });
  } catch (error) {
    console.error("Verify reset OTP error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
