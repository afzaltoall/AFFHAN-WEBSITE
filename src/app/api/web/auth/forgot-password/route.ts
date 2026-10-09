import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkPasswordResetRateLimit } from "@/lib/rate-limit";
import { issueEmailOtp } from "@/lib/email-otp";
import { canDeliverTo, sendEmail } from "@/lib/email";
import { noPasswordOnAccountEmail, passwordResetCodeEmail } from "@/lib/email-templates";
import { OFFICES } from "@/lib/brand";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Said instead when no email can leave at all (lib/email.ts, canDeliverTo),
 * with somewhere to go: the head office's number, and the WhatsApp the
 * company's profiles publish. Chennai publishes no WhatsApp of its own, so
 * that one is Dubai's.
 */
const CANNOT_SEND = "We couldn't send the code right now. Please contact us on WhatsApp or call us.";
const spaced = (n: string) => n.replace(/-/g, " ");
const CONTACT = {
  phone: spaced(OFFICES.chennai.telephone),
  tel: `tel:${OFFICES.chennai.telephone.replace(/[^+\d]/g, "")}`,
  whatsappNumber: spaced(OFFICES.dubai.telephone),
  whatsapp: OFFICES.dubai.whatsapp,
};

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
 * The one other answer, that no code can be sent at all, is decided before any
 * account is read, and is the same for every address while it holds.
 *
 * The code itself is never logged and never returned.
 */
export async function POST(request: NextRequest) {
  const generic = NextResponse.json({
    message: "If that email is registered, we've sent a code to it.",
  });

  try {
    // Per-IP. The per-address limit is inside issueEmailOtp, in the database,
    // because this one is inert until Upstash is configured.
    const limit = await checkPasswordResetRateLimit(request);
    if (!limit.success) return generic;

    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !EMAIL_RE.test(email)) return generic;

    // Before the account is looked up, so the answer is the same for every
    // address: it depends on the sender (unconfigured, sandbox, a send that
    // just failed), never on whether this one is registered. A send that fails
    // below still answers `generic`; saying otherwise there would confirm the
    // account. It is that failure which makes the next ask land here.
    const delivery = await canDeliverTo(email);
    if (!delivery.ok) {
      console.warn(`[forgot-password] no code can be sent (${delivery.why}); showed WhatsApp and phone instead.`);
      return NextResponse.json({ error: CANNOT_SEND, reason: "cannot_send", contact: CONTACT }, { status: 503 });
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
    // the server log so a broken SES identity is visible, but it must not
    // change what the caller is told.
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
