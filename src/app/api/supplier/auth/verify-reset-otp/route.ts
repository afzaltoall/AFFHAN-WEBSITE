import { NextResponse, type NextRequest } from "next/server";
import { checkPasswordResetRateLimit, limitReached } from "@/lib/rate-limit";
import { checkEmailOtp } from "@/lib/email-otp";
import { issueResetToken } from "@/lib/reset-token";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Check a supplier's reset code and hand back a ten-minute token: the staff route with the supplier purpose
 * and audience. The audience is inside the token's signature, so the token minted here is refused by the
 * customer and staff reset routes, and theirs by this flow.
 */
export async function POST(request: NextRequest) {
  try {
    const limit = await checkPasswordResetRateLimit(request);
    if (!limit.success) return limitReached("There have been a lot of password-reset requests from this connection.", limit);

    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter the email you used." }, { status: 400 });
    }
    if (!/^\d{4,10}$/.test(code)) {
      return NextResponse.json({ error: "Enter the code we sent you." }, { status: 400 });
    }

    const result = await checkEmailOtp(email, "SUPPLIER_PASSWORD_RESET", code);
    if (!result.ok) {
      if (result.reason === "too_many_attempts") {
        return NextResponse.json({ error: "Too many wrong codes. Ask for a new one." }, { status: 429 });
      }
      return NextResponse.json({ error: "That code is wrong or has expired. Ask for a new one." }, { status: 400 });
    }

    return NextResponse.json({ resetToken: issueResetToken(email, result.otpId, "supplier") });
  } catch (error) {
    console.error("Supplier verify reset code error:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
