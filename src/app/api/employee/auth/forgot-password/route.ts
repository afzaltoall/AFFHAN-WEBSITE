import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkPasswordResetRateLimit } from "@/lib/rate-limit";
import { issueEmailOtp } from "@/lib/email-otp";
import { sendEmail } from "@/lib/email";
import { passwordResetCodeEmail } from "@/lib/email-templates";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Ask for a staff password-reset code.
 *
 * The customer route's shape, against the Employee table: one sentence back
 * whatever happened, so this cannot be used to ask "does this address belong to
 * somebody at Affhan" — which is worth more to whoever is asking than the
 * customer version, since a staff address is a target.
 *
 * The code is issued under EMPLOYEE_PASSWORD_RESET, not PASSWORD_RESET. One
 * person may hold both a customer account and a staff account on the same
 * address, and a code answered in one flow must not set the password in the
 * other.
 */
export async function POST(request: NextRequest) {
  const generic = NextResponse.json({
    message: "If that address belongs to a staff account, we've sent a code to it.",
  });

  try {
    const limit = await checkPasswordResetRateLimit(request);
    if (!limit.success) return generic;

    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !EMAIL_RE.test(email)) return generic;

    const employee = await prisma.employee.findUnique({
      where: { email },
      select: { id: true, isActive: true },
    });

    // Deactivated staff are told nothing and sent nothing: an account that
    // cannot sign in has no password worth resetting.
    if (!employee || !employee.isActive) return generic;

    const issued = await issueEmailOtp(email, "EMPLOYEE_PASSWORD_RESET");
    if (!issued.ok) return generic;

    // Checked, not fired and forgotten — a broken sender should be visible in
    // the log even though the caller is told the same thing either way.
    const sent = await sendEmail({ to: email, ...passwordResetCodeEmail(issued.code) });
    if (!sent.ok) {
      console.error("[employee forgot-password] code not delivered:", sent.reason);
    }

    return generic;
  } catch (error) {
    console.error("Employee forgot password error:", error);
    return generic;
  }
}
