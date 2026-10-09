import { GetAccountCommand, SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Transactional email, over Amazon SES.
//
// Deliberately generic: this knows how to put a message on the wire and
// nothing about passwords, codes or accounts. Anything transactional we add
// later — an inquiry acknowledgement, a status change — uses the same door.
//
// SENDING IS OFF UNTIL CREDENTIALS EXIST. There is no flag to forget to turn
// off: with no AWS_SES_* variables the client is never constructed and every
// call returns `unconfigured`. That is the current state, so nothing here can
// email anybody yet.
//
// Its own credentials, not the ones S3 uses. The image-upload key is handed to
// local scripts and writes to a public bucket; a key that can send mail as
// affhan.com is a different kind of thing to lose. Keeping them apart means a
// leak of either one does not become a leak of the other, and they can be
// rotated on their own schedules. The cost is one more pair of variables.
// ---------------------------------------------------------------------------

const REGION = process.env.AWS_SES_REGION || "";
const ACCESS_KEY_ID = process.env.AWS_SES_ACCESS_KEY_ID || "";
const SECRET_ACCESS_KEY = process.env.AWS_SES_SECRET_ACCESS_KEY || "";
const FROM_ADDRESS = process.env.AWS_SES_FROM_ADDRESS || "";
const FROM_NAME = process.env.AWS_SES_FROM_NAME || "Affhan Group";

/**
 * The SES configuration set every message is sent through. It publishes Bounce
 * and Complaint events to SNS, which delivers them to /api/ses/notifications;
 * that is how a bad address reaches EmailSuppression. It has to exist in the
 * SES account (same region) before this code runs, or SES refuses every send.
 */
const CONFIGURATION_SET = process.env.AWS_SES_CONFIGURATION_SET?.trim() || "affhan-transactional";

/**
 * Where a reply goes. Mail leaves from a no-reply address, so without this a
 * customer who answers a reset email writes into nothing. info@affhan.com is
 * the address the contact page publishes; the templates' footers tell the
 * reader they can reply.
 */
const REPLY_TO = process.env.AWS_SES_REPLY_TO?.trim() || "info@affhan.com";

/**
 * While the identity is in the SES sandbox, only addresses verified in the
 * console can receive anything — SES rejects the rest, and a rejection looks
 * to us like a delivery failure. Setting this to a comma-separated list makes
 * that refusal happen here instead, where it is legible, and stops a test run
 * from firing at a real customer by accident. Leave it unset once production
 * access is granted.
 */
const ALLOWED = (process.env.AWS_SES_ALLOWED_RECIPIENTS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function sesConfigured(): boolean {
  return Boolean(REGION && ACCESS_KEY_ID && SECRET_ACCESS_KEY && FROM_ADDRESS);
}

// Built once and reused; constructing a client per send would open a new
// connection pool for every email.
let client: SESv2Client | null = null;
function getClient(): SESv2Client | null {
  if (!sesConfigured()) return null;
  if (!client) {
    client = new SESv2Client({
      region: REGION,
      credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
    });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Can a message leave at all?
//
// For a page that has to tell a customer "we couldn't send the code" without
// telling a stranger whether the address has an account. So it is asked about
// the SENDER, before anything about the recipient is looked up: is SES set up,
// is the account out of the sandbox, has a send just failed. The one part that
// reads the address is the sandbox allowlist, a list of test addresses rather
// than of accounts. The suppression list is left out on purpose: it only ever
// holds addresses we have mailed, so consulting it here would answer exactly
// the question this must not.
//
// The failure memory is per server instance, so it is a hint rather than a
// guarantee: an instance that has not seen the failure still tries, and that
// try is what teaches it.
// ---------------------------------------------------------------------------

const ACCOUNT_TTL_MS = 10 * 60 * 1000;
const FAILURE_WINDOW_MS = 10 * 60 * 1000;
let account: { production: boolean | null; at: number } | null = null;
let lastFailureAt = 0;

/** Out of the SES sandbox? null when SES will not say (no ses:GetAccount permission, network). Cached. */
async function productionAccess(ses: SESv2Client): Promise<boolean | null> {
  if (account && Date.now() - account.at < ACCOUNT_TTL_MS) return account.production;
  let production: boolean | null = null;
  try {
    const out = await ses.send(new GetAccountCommand({}));
    production = typeof out.ProductionAccessEnabled === "boolean" ? out.ProductionAccessEnabled : null;
  } catch (error) {
    console.warn("[email] could not read the SES account state:", error instanceof Error ? error.name : "unknown");
  }
  account = { production, at: Date.now() };
  return production;
}

export type Deliverability = { ok: true } | { ok: false; why: "unconfigured" | "recent_failure" | "not_allowed" | "sandbox" };

export async function canDeliverTo(address: string): Promise<Deliverability> {
  const ses = getClient();
  if (!ses) return { ok: false, why: "unconfigured" };
  if (lastFailureAt && Date.now() - lastFailureAt < FAILURE_WINDOW_MS) return { ok: false, why: "recent_failure" };
  if (ALLOWED.length > 0) return ALLOWED.includes(address.trim().toLowerCase()) ? { ok: true } : { ok: false, why: "not_allowed" };
  // Unknown counts as yes, so a missing permission cannot switch email off;
  // if the send then fails, that failure answers for the next ten minutes.
  return (await productionAccess(ses)) === false ? { ok: false, why: "sandbox" } : { ok: true };
}

export type SendResult =
  | { ok: true; messageId: string | undefined }
  | { ok: false; reason: "unconfigured" | "not_allowed" | "suppressed" | "rejected"; message: string };

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
  const ses = getClient();
  if (!ses) {
    // Says which knob is missing, without printing any value. Before this, an
    // unconfigured SES returned silently, so "the email never arrived and the
    // log is empty" was ambiguous between missing env vars and a send that was
    // rejected — the first thing you need to rule out, and the one that left
    // no trace.
    const missing = [
      !process.env.AWS_SES_REGION && "AWS_SES_REGION",
      !process.env.AWS_SES_ACCESS_KEY_ID && "AWS_SES_ACCESS_KEY_ID",
      !process.env.AWS_SES_SECRET_ACCESS_KEY && "AWS_SES_SECRET_ACCESS_KEY",
      !process.env.AWS_SES_FROM_ADDRESS && "AWS_SES_FROM_ADDRESS",
    ].filter(Boolean);
    console.warn(
      "[email] not configured; nothing sent. Missing: " +
        (missing.length ? missing.join(", ") : "(client init failed despite vars being present)")
    );
    return {
      ok: false,
      reason: "unconfigured",
      message: "Email sending is not configured yet.",
    };
  }

  const to = message.to.trim().toLowerCase();

  // Never to an address that bounced permanently or complained: SES reported
  // it through SNS (lib/ses-notifications.ts). If the list cannot be read,
  // nothing is sent either, rather than risk mailing one of them.
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

  if (ALLOWED.length > 0 && !ALLOWED.includes(to)) {
    // Sandbox guard. Deliberately not an error the customer sees — see the
    // note on AWS_SES_ALLOWED_RECIPIENTS.
    console.warn("[email] recipient not on the sandbox allowlist; nothing sent.");
    return {
      ok: false,
      reason: "not_allowed",
      message: "That address is not on the sandbox allowlist.",
    };
  }

  try {
    const out = await ses.send(
      new SendEmailCommand({
        FromEmailAddress: FROM_NAME ? `${FROM_NAME} <${FROM_ADDRESS}>` : FROM_ADDRESS,
        Destination: { ToAddresses: [to] },
        ConfigurationSetName: CONFIGURATION_SET,
        ReplyToAddresses: [message.replyTo ?? REPLY_TO],
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: "UTF-8" },
            Body: {
              Text: { Data: message.text, Charset: "UTF-8" },
              ...(message.html
                ? { Html: { Data: message.html, Charset: "UTF-8" } }
                : {}),
            },
          },
        },
      })
    );
    lastFailureAt = 0;
    return { ok: true, messageId: out.MessageId };
  } catch (error) {
    // The message name only — an SES error can quote the destination and the
    // headers, and this is not the place for either.
    const name = error instanceof Error ? error.name : "unknown";
    // A malformed address is this message's problem alone. Anything else —
    // credentials, a missing configuration set, the sandbox, throttling, a
    // paused account, the network — is the sender's, and canDeliverTo says so.
    if (name !== "BadRequestException") lastFailureAt = Date.now();
    console.error("[email] send failed:", name);
    return {
      ok: false,
      reason: "rejected",
      message: "The email could not be sent.",
    };
  }
}
