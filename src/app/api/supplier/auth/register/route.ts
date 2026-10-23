import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkTurnstile } from "@/lib/turnstile";
import { checkSupplierRegisterRateLimit, getClientIp, limitReached } from "@/lib/rate-limit";
import { checkPasswordStrength } from "@/lib/password";
import { readSignup } from "@/lib/supplier-offer";
import { issueEmailOtp } from "@/lib/email-otp";
import { canSendEmail, sendEmail } from "@/lib/email";
import { supplierSignupCodeEmail } from "@/lib/email-templates";
import { cannotSendEmailOnlyResponse } from "@/lib/cannot-send";
import { OTP_RESEND_COOLDOWN_MS } from "@/lib/mobile-otp";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAKEN = "A supplier account with this email already exists. Sign in instead.";

/**
 * Creating a supplier account, step one: check the details and email a code (the supplier portal, 2026-10-21;
 * the code since 2026-10-23, the owner's "email check at sign-up").
 *
 * The customer sign-up's four fields, name, email, mobile and password (the owner: "same as user login style"),
 * for a table of its own: a supplier account is never a customer's, nor the other way round. The company, the
 * WeChat ID and the address are asked when the supplier applies for a product. Nothing waits for the team's
 * approval: the owner chose "apply right away". What waits is the address: nothing is created here, and the
 * account opens only when the code sent to it comes back (register/verify), so every supplier email is real.
 *
 * Open to anyone, so Turnstile comes first and a per-connection limit second, as on the customer sign-in. An
 * address that already has an account is told so: someone registering needs to know to sign in instead, which
 * is the customer sign-up's trade too. Asking again sends a new code, within lib/email-otp.ts's limits.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // Turnstile first, before the limit is spent or anything read.
    const human = await checkTurnstile(body?.turnstileToken, getClientIp(request));
    if (!human.ok) return NextResponse.json({ error: human.error }, { status: human.status });

    const limit = await checkSupplierRegisterRateLimit(request);
    if (!limit.success) return limitReached("There have been a lot of registrations from this connection.", limit);

    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) return NextResponse.json({ error: "Enter your email address.", field: "email" }, { status: 400 });
    if (email.length > 254 || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address.", field: "email" }, { status: 400 });
    }

    // Every detail is checked now, so nothing about them can fail once the code is back.
    const password = typeof body?.password === "string" ? body.password : "";
    const strength = checkPasswordStrength(password);
    if (!strength.ok) return NextResponse.json({ error: strength.error, field: "password" }, { status: 400 });

    const who = readSignup(body && typeof body === "object" ? body : {});
    if (!who.ok) return NextResponse.json({ error: who.error, field: who.field }, { status: 400 });

    const taken = await prisma.supplierAccount.findUnique({ where: { email }, select: { id: true } });
    if (taken) return NextResponse.json({ error: TAKEN, field: "email" }, { status: 409 });

    // When no code can leave at all, say so before a code is minted: by email only, never a number or WhatsApp
    // (the owner, 2026-10-23).
    const delivery = canSendEmail();
    if (!delivery.ok) {
      console.warn(`[supplier register] no code can be sent (${delivery.why}); asked to try again later.`);
      return cannotSendEmailOnlyResponse();
    }

    const issued = await issueEmailOtp(email, "SUPPLIER_SIGNUP");
    if (!issued.ok) {
      const wait = issued.retryAfterSeconds;
      return NextResponse.json(
        {
          error:
            issued.reason === "cooldown"
              ? `We've just sent a code. You can ask for another in ${wait} seconds.`
              : `That's several codes for this email. Try again in ${Math.ceil(wait / 60)} minutes.`,
          retryAfterSeconds: wait,
        },
        { status: 429, headers: { "Retry-After": String(wait) } },
      );
    }

    const sent = await sendEmail({ to: email, ...supplierSignupCodeEmail(issued.code) });
    if (!sent.ok) {
      if (sent.reason === "suppressed") {
        return NextResponse.json({ error: "We can't send email to this address any more. Use another email.", field: "email" }, { status: 400 });
      }
      console.error("[supplier register] code not delivered:", sent.reason);
      return cannotSendEmailOnlyResponse();
    }

    return NextResponse.json({ sent: true, resendAfterSeconds: Math.round(OTP_RESEND_COOLDOWN_MS / 1000) });
  } catch (error) {
    // The name only: a Prisma failure prints its arguments.
    console.error("Supplier register error:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
