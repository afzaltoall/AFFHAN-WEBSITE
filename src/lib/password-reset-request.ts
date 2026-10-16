import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueEmailOtp } from "@/lib/email-otp";
import { canSendEmail, sendEmail } from "@/lib/email";
import { noPasswordOnAccountEmail, passwordResetCodeEmail } from "@/lib/email-templates";
import { cannotSendResponse } from "@/lib/cannot-send";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Ask for a password reset code: the part both routes share, the website's (/api/web/auth/forgot-password,
 * Turnstile first) and the app's (/api/mobile/auth/forgot-password, which cannot show Turnstile). Each route
 * checks its own way in and the per-connection limit before calling this; the per-address limit is inside
 * issueEmailOtp, in the database, and holds for both.
 *
 * The answer is the same sentence whatever happens: address unknown, address known, code sent, code refused by
 * the per-address limit. Anything else turns this into a way of asking "does this person have an account here",
 * which is worth something to whoever is asking and nothing to us. That sameness has to survive the failure
 * paths too, which is why every branch falls through to one `generic` response rather than returning its own.
 * The timing differs a little between branches; closing that gap properly means queueing the work, and it is
 * not the leak worth engineering against here.
 *
 * The one other answer, that no code can be sent at all (WhatsApp and a phone number instead,
 * lib/cannot-send.ts), is decided before any account is read, and is the same for every address while it holds.
 * It holds only once a send has really failed (or Brevo is not set up): a code is otherwise just sent.
 *
 * The code itself is never logged and never returned.
 */
export async function requestPasswordResetCode(rawEmail: unknown, label: string): Promise<NextResponse> {
  const generic = NextResponse.json({
    message: "If that email is registered, we've sent a code to it.",
  });

  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (!email || !EMAIL_RE.test(email)) return generic;

  // Before the account is looked up, so the answer is the same for every address: it depends on the sender
  // (unconfigured, or a send that just failed), never on whether this one is registered. A send that fails below
  // still answers `generic`; saying otherwise there would confirm the account. It is that failure which makes the
  // next ask land here.
  const delivery = canSendEmail();
  if (!delivery.ok) {
    console.warn(`[${label}] no code can be sent (${delivery.why}); showed WhatsApp and phone instead.`);
    return cannotSendResponse();
  }

  const user = await prisma.mobileUser.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, accountStatus: true },
  });

  // No account, or a suspended one: say nothing, send nothing.
  if (!user || user.accountStatus !== "ACTIVE") return generic;

  // An account with no password has nothing to reset. Rather than a dead end, the owner of the inbox is told why
  // no code arrived — which reveals nothing to anyone else, because only they can read it.
  if (!user.passwordHash) {
    // Checked like the code path below, not fired and forgotten. A Google-only account hitting a broken SES was
    // the one branch that sent an email and never looked at whether it left — so a misconfiguration here was
    // invisible in exactly the case we were testing with.
    const sent = await sendEmail({ to: email, ...noPasswordOnAccountEmail() });
    if (!sent.ok) {
      console.error(`[${label}] no-password notice not delivered:`, sent.reason);
    }
    return generic;
  }

  const issued = await issueEmailOtp(email, "PASSWORD_RESET");
  if (!issued.ok) return generic;

  // Fire-and-check, not fire-and-forget: a failure here is worth a line in the server log so a broken sender is
  // visible, but it must not change what the caller is told.
  const sent = await sendEmail({ to: email, ...passwordResetCodeEmail(issued.code) });
  if (!sent.ok) {
    console.error(`[${label}] code not delivered:`, sent.reason);
  }

  return generic;
}
