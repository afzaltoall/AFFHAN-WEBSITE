import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkPasswordResetRateLimit, getClientIp } from "@/lib/rate-limit";
import { checkTurnstile } from "@/lib/turnstile";
import { issueEmailOtp } from "@/lib/email-otp";
import { canSendEmail, sendEmail } from "@/lib/email";
import { passwordResetCodeEmail } from "@/lib/email-templates";
import { cannotSendResponse } from "@/lib/cannot-send";

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
 *
 * As the customer route: when no code can leave at all (a send has really
 * failed in the last ten minutes, or Brevo is not set up), WhatsApp and a
 * phone number instead (lib/cannot-send.ts), decided before any account is
 * read so it is the same for every address.
 */
export async function POST(request: NextRequest) {
  const generic = NextResponse.json({
    message: "If that address belongs to a staff account, we've sent a code to it.",
  });

  try {
    const body = await request.json().catch(() => ({}));

    // Turnstile first, before the limit is spent or anything read (2026-10-09).
    const human = await checkTurnstile(body?.turnstileToken, getClientIp(request));
    if (!human.ok) return NextResponse.json({ error: human.error }, { status: human.status });

    const limit = await checkPasswordResetRateLimit(request);
    if (!limit.success) return generic;

    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !EMAIL_RE.test(email)) return generic;

    // Before the account is looked up: it depends on the sender, never on
    // whether this address is a staff one. A send that fails below still
    // answers `generic`, and it is that failure which makes the next ask land
    // here.
    const delivery = canSendEmail();
    if (!delivery.ok) {
      console.warn(`[employee forgot-password] no code can be sent (${delivery.why}); showed WhatsApp and phone instead.`);
      return cannotSendResponse();
    }

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
