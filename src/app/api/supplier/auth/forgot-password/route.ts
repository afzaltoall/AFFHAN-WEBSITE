import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkPasswordResetRateLimit, getClientIp, limitReached } from "@/lib/rate-limit";
import { checkTurnstile } from "@/lib/turnstile";
import { issueEmailOtp } from "@/lib/email-otp";
import { canSendEmail, sendEmail } from "@/lib/email";
import { supplierPasswordResetCodeEmail } from "@/lib/email-templates";
import { cannotSendEmailOnlyResponse } from "@/lib/cannot-send";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Ask for a supplier's password-reset code: the staff route's shape (app/api/employee/auth/forgot-password)
 * against the SupplierAccount table, issued under SUPPLIER_PASSWORD_RESET so a code asked for here can never
 * reset a customer's or a member of staff's password on the same address.
 *
 * One sentence back whatever happened, so this cannot be used to ask which addresses are suppliers of ours.
 * When no code can leave at all, a request to try again later (lib/cannot-send.ts), decided before any account
 * is read: a supplier gets back into their account by email only, never by the company's number or WhatsApp
 * (the owner, 2026-10-23). The code comes in the Supplier Centre's own email, not the customers' reset email.
 */
export async function POST(request: NextRequest) {
  const generic = NextResponse.json({
    message: "If that email belongs to a supplier account, we've sent a code to it.",
  });

  try {
    const body = await request.json().catch(() => ({}));

    // Turnstile first, before the limit is spent or anything read.
    const human = await checkTurnstile(body?.turnstileToken, getClientIp(request));
    if (!human.ok) return NextResponse.json({ error: human.error }, { status: human.status });

    const limit = await checkPasswordResetRateLimit(request);
    if (!limit.success) return limitReached("There have been a lot of password-reset requests from this connection.", limit);

    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !EMAIL_RE.test(email)) return generic;

    const delivery = canSendEmail();
    if (!delivery.ok) {
      console.warn(`[supplier forgot-password] no code can be sent (${delivery.why}); asked to try again later.`);
      return cannotSendEmailOnlyResponse();
    }

    const account = await prisma.supplierAccount.findUnique({ where: { email }, select: { status: true } });
    // A blocked account is told nothing and sent nothing: it cannot sign in, so it has no password worth resetting.
    if (!account || account.status !== "ACTIVE") return generic;

    const issued = await issueEmailOtp(email, "SUPPLIER_PASSWORD_RESET");
    if (!issued.ok) return generic;

    const sent = await sendEmail({ to: email, ...supplierPasswordResetCodeEmail(issued.code) });
    if (!sent.ok) console.error("[supplier forgot-password] code not delivered:", sent.reason);

    return generic;
  } catch (error) {
    console.error("Supplier forgot password error:", error instanceof Error ? error.name : "unknown");
    return generic;
  }
}
