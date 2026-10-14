import { NextResponse, type NextRequest } from "next/server";
import { checkPasswordResetRateLimit } from "@/lib/rate-limit";
import { checkEmailOtp } from "@/lib/email-otp";
import { issueResetToken } from "@/lib/reset-token";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Check a staff reset code and hand back a short-lived token.
 *
 * The customer route, with the staff purpose and the staff audience. The token
 * carries the audience inside its signature, so the one minted here is refused
 * by the customer reset route and vice versa.
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

    const result = await checkEmailOtp(email, "EMPLOYEE_PASSWORD_RESET", code);

    if (!result.ok) {
      if (result.reason === "too_many_attempts") {
        return NextResponse.json({ error: "Too many wrong codes. Ask for a new one." }, { status: 429 });
      }
      return NextResponse.json(
        { error: "That code is wrong or has expired. Ask for a new one." },
        { status: 400 }
      );
    }

    return NextResponse.json({ resetToken: issueResetToken(email, result.otpId, "employee") });
  } catch (error) {
    console.error("Employee verify reset OTP error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
