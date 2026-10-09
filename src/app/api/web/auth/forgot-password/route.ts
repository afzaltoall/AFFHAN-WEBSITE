import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkPasswordResetRateLimit, getClientIp, limiterUnavailable } from "@/lib/rate-limit";
import { checkTurnstile } from "@/lib/turnstile";
import { issueEmailOtp } from "@/lib/email-otp";
import { canSendEmail, sendEmail } from "@/lib/email";
import { noPasswordOnAccountEmail, passwordResetCodeEmail } from "@/lib/email-templates";
import { cannotSendResponse } from "@/lib/cannot-send";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Ask for a password reset code.
 *
 * The answer is the same sentence whatever happens: address unknown, address
 * known, code sent, code refused by the rate limit. Anything else turns this
 * route into a way of asking "does this person have an account here", which is
 * worth something to whoever is asking and nothing to us.
 *
 * That sameness has to survive the failure paths too, which is why every
 * branch below falls through to one `generic` response rather than returning
 * its own — including the rate limit, which would otherwise say "you have
 * asked three times about this address" and thereby confirm it exists. The
 * timing differs a little between branches; closing that gap properly means
 * queueing the work, and it is not the leak worth engineering against here.
 *
 * The one other answer, that no code can be sent at all (WhatsApp and a phone
 * number instead, lib/cannot-send.ts), is decided before any account is read,
 * and is the same for every address while it holds. It holds only once a send
 * has really failed (or Brevo is not set up): a code is otherwise just sent.
 *
 * The code itself is never logged and never returned.
 */
export async function POST(request: NextRequest) {
  const generic = NextResponse.json({
    message: "If that email is registered, we've sent a code to it.",
  });

  try {
    const body = await request.json().catch(() => ({}));

    // Turnstile first, before the limit is spent or anything read (2026-10-09).
    // It says nothing about the address either way.
    const human = await checkTurnstile(body?.turnstileToken, getClientIp(request));
    if (!human.ok) return NextResponse.json({ error: human.error }, { status: human.status });

    // Per-IP, and refused in production until Upstash is configured
    // (lib/rate-limit.ts); a 503 says nothing about the address, which has not
    // been read yet. The per-address limit is inside issueEmailOtp, in the
    // database, so it holds with or without Redis.
    const limit = await checkPasswordResetRateLimit(request);
    if (limit.unavailable) return limiterUnavailable("Password reset");
    if (!limit.success) return generic;

    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !EMAIL_RE.test(email)) return generic;

    // Before the account is looked up, so the answer is the same for every
    // address: it depends on the sender (unconfigured, or a send that just
    // failed), never on whether this one is registered. A send that fails
    // below still answers `generic`; saying otherwise there would confirm the
    // account. It is that failure which makes the next ask land here.
    const delivery = canSendEmail();
    if (!delivery.ok) {
      console.warn(`[forgot-password] no code can be sent (${delivery.why}); showed WhatsApp and phone instead.`);
      return cannotSendResponse();
    }

    const user = await prisma.mobileUser.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, accountStatus: true },
    });

    // No account, or a suspended one: say nothing, send nothing.
    if (!user || user.accountStatus !== "ACTIVE") return generic;

    // An account with no password has nothing to reset. Rather than a dead
    // end, the owner of the inbox is told why no code arrived — which reveals
    // nothing to anyone else, because only they can read it.
    if (!user.passwordHash) {
      // Checked like the code path below, not fired and forgotten. A Google-only
      // account hitting a broken SES was the one branch that sent an email and
      // never looked at whether it left — so a misconfiguration here was
      // invisible in exactly the case we were testing with.
      const sent = await sendEmail({ to: email, ...noPasswordOnAccountEmail() });
      if (!sent.ok) {
        console.error("[forgot-password] no-password notice not delivered:", sent.reason);
      }
      return generic;
    }

    const issued = await issueEmailOtp(email, "PASSWORD_RESET");
    if (!issued.ok) return generic;

    // Fire-and-check, not fire-and-forget: a failure here is worth a line in
    // the server log so a broken sender is visible, but it must not change
    // what the caller is told.
    const sent = await sendEmail({ to: email, ...passwordResetCodeEmail(issued.code) });
    if (!sent.ok) {
      console.error("[forgot-password] code not delivered:", sent.reason);
    }

    return generic;
  } catch (error) {
    console.error("Forgot password error:", error);
    // Even a crash answers the same way.
    return generic;
  }
}
