import { GetAccountCommand, SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Transactional email over Amazon SES: lib/email.ts as it was until 2026-10-14,
// moved here unchanged when sending went to Brevo (lib/brevo.ts). Nothing
// imports it. AWS refused the account production access for good, so SES only
// ever reached the sandbox's verified addresses; this is kept for a separate
// cleanup, with the bounce pipeline it fed (lib/ses-notifications.ts).
//
// Its own credentials, not the ones S3 uses. The image-upload key is handed to
// local scripts and writes to a public bucket; a key that can send mail as
// affhan.com is a different kind of thing to lose.
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

/** Where a reply goes: the address the contact page publishes. */
const REPLY_TO = process.env.AWS_SES_REPLY_TO?.trim() || "info@affhan.com";

/**
 * While the identity is in the SES sandbox, only addresses verified in the
 * console can receive anything. Setting this to a comma-separated list makes
 * that refusal happen here instead, where it is legible.
 */
const ALLOWED = (process.env.AWS_SES_ALLOWED_RECIPIENTS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function sesConfigured(): boolean {
  return Boolean(REGION && ACCESS_KEY_ID && SECRET_ACCESS_KEY && FROM_ADDRESS);
}

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

export type SesDeliverability = { ok: true } | { ok: false; why: "unconfigured" | "recent_failure" | "not_allowed" | "sandbox" };

export async function sesCanDeliverTo(address: string): Promise<SesDeliverability> {
  const ses = getClient();
  if (!ses) return { ok: false, why: "unconfigured" };
  if (lastFailureAt && Date.now() - lastFailureAt < FAILURE_WINDOW_MS) return { ok: false, why: "recent_failure" };
  if (ALLOWED.length > 0) return ALLOWED.includes(address.trim().toLowerCase()) ? { ok: true } : { ok: false, why: "not_allowed" };
  return (await productionAccess(ses)) === false ? { ok: false, why: "sandbox" } : { ok: true };
}

export type SesSendResult =
  | { ok: true; messageId: string | undefined }
  | { ok: false; reason: "unconfigured" | "not_allowed" | "suppressed" | "rejected"; message: string };

export interface SesEmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

/** Send one message over SES. Never throws; nothing about the body is logged. */
export async function sendEmailViaSes(message: SesEmailMessage): Promise<SesSendResult> {
  const ses = getClient();
  if (!ses) {
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
    return { ok: false, reason: "unconfigured", message: "Email sending is not configured yet." };
  }

  const to = message.to.trim().toLowerCase();

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
    console.warn("[email] recipient not on the sandbox allowlist; nothing sent.");
    return { ok: false, reason: "not_allowed", message: "That address is not on the sandbox allowlist." };
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
              ...(message.html ? { Html: { Data: message.html, Charset: "UTF-8" } } : {}),
            },
          },
        },
      })
    );
    lastFailureAt = 0;
    return { ok: true, messageId: out.MessageId };
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    if (name !== "BadRequestException") lastFailureAt = Date.now();
    console.error("[email] send failed:", name);
    return { ok: false, reason: "rejected", message: "The email could not be sent." };
  }
}
