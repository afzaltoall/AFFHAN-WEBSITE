import { prisma } from "@/lib/prisma";
import { brevoConfigured, brevoMissing, brevoSend } from "@/lib/brevo";

// ---------------------------------------------------------------------------
// Transactional email, over Brevo (lib/brevo.ts) since 2026-10-14. Until then
// Amazon SES, which AWS never let out of its sandbox; that code is kept, unused,
// in lib/email-ses.ts.
//
// Deliberately generic: this knows how to put a message on the wire and
// nothing about passwords, codes or accounts. Anything transactional we add
// later — an inquiry acknowledgement, a status change — uses the same door.
//
// SENDING IS OFF UNTIL CREDENTIALS EXIST. There is no flag to forget to turn
// off: with no BREVO_API_KEY or BREVO_SENDER_EMAIL every call returns
// `unconfigured`.
// ---------------------------------------------------------------------------

/**
 * Where a reply goes. Mail leaves from a no-reply address, so without this a
 * customer who answers a reset email writes into nothing. info@affhan.com is
 * the address the contact page publishes; the templates' footers tell the
 * reader they can reply.
 */
const REPLY_TO = "info@affhan.com";

// ---------------------------------------------------------------------------
// Can a message leave at all?
//
// For a page that has to tell a customer "we couldn't send the code" without
// telling a stranger whether the address has an account. So it is asked about
// the SENDER only, before anything about the recipient is looked up: is Brevo
// set up, and has a send failed in the last ten minutes. Nothing here doubts a
// sender that has not failed: SES's version also said no while its account sat
// in the sandbox, which AWS never lifted, so every customer was shown the
// fallback. The suppression list is left out on purpose: it only ever holds
// addresses we have mailed, so consulting it here would answer exactly the
// question this must not.
//
// The failure memory is per server instance, so it is a hint rather than a
// guarantee: an instance that has not seen the failure still tries, and that
// try is what teaches it.
// ---------------------------------------------------------------------------

const FAILURE_WINDOW_MS = 10 * 60 * 1000;
let lastFailureAt = 0;

export type Deliverability = { ok: true } | { ok: false; why: "unconfigured" | "recent_failure" };

export function canSendEmail(): Deliverability {
  if (!brevoConfigured()) return { ok: false, why: "unconfigured" };
  if (lastFailureAt && Date.now() - lastFailureAt < FAILURE_WINDOW_MS) return { ok: false, why: "recent_failure" };
  return { ok: true };
}

export type SendResult =
  | { ok: true; messageId: string | undefined }
  | { ok: false; reason: "unconfigured" | "suppressed" | "rejected"; message: string };

export interface EmailMessage {
  to: string;
  subject: string;
  /** Always provide this. Some clients never render the HTML, and a blank
   *  message is worse than a plain one. */
  text: string;
  html?: string;
  /** Where a reply should go; REPLY_TO when not given. */
  replyTo?: string;
}

/**
 * Send one message.
 *
 * Never throws: callers are routes that have already done something for the
 * customer, and an email that did not go out must not turn a completed action
 * into a 500. The result says what happened; the caller decides whether that
 * matters.
 *
 * Nothing about the body is logged. A password-reset code travels through
 * here, and a log line is a place it would outlive its ten minutes.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  if (!brevoConfigured()) {
    // Says which knob is missing, without printing any value, so "the email
    // never arrived and the log is empty" cannot mean a missing variable.
    console.warn(`[email] not configured; nothing sent. Missing: ${brevoMissing().join(", ")}`);
    return { ok: false, reason: "unconfigured", message: "Email sending is not configured yet." };
  }

  const to = message.to.trim().toLowerCase();

  // Never to an address that bounced permanently or complained: Brevo reports
  // them to /api/brevo/webhook (lib/brevo-events.ts), as SES did to
  // /api/ses/notifications. If the list cannot be read, nothing is sent
  // either, rather than risk mailing one of them.
  try {
    const suppressed = await prisma.emailSuppression.findUnique({ where: { email: to }, select: { id: true } });
    if (suppressed) {
      console.warn("[email] address is on the suppression list (bounce or complaint); nothing sent.");
      return { ok: false, reason: "suppressed", message: "That address no longer receives our email." };
    }
  } catch (error) {
    console.error("[email] suppression list unreadable; nothing sent:", error instanceof Error ? error.name : "unknown");
    return { ok: false, reason: "rejected", message: "The email could not be sent." };
  }

  const sent = await brevoSend({ to, subject: message.subject, text: message.text, html: message.html, replyTo: message.replyTo ?? REPLY_TO });
  if (sent.ok) {
    lastFailureAt = 0;
    return { ok: true, messageId: sent.messageId };
  }
  // Every refusal counts against the sender, and canSendEmail says so for ten
  // minutes. Brevo answers 400 both for a recipient it will not take and for a
  // sender it has not verified, and the addresses that reach here are already
  // an account's; so a 400 is far likelier the sender's, and reset codes lost
  // without a word for ten minutes are worse than the fallback shown for ten.
  lastFailureAt = Date.now();
  return { ok: false, reason: "rejected", message: "The email could not be sent." };
}
