import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

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

export type SendResult =
  | { ok: true; messageId: string | undefined }
  | { ok: false; reason: "unconfigured" | "not_allowed" | "rejected"; message: string };

export interface EmailMessage {
  to: string;
  subject: string;
  /** Always provide this. Some clients never render the HTML, and a blank
   *  message is worse than a plain one. */
  text: string;
  html?: string;
  /** Where a reply should go, if not the no-reply sender. */
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
    return {
      ok: false,
      reason: "unconfigured",
      message: "Email sending is not configured yet.",
    };
  }

  const to = message.to.trim().toLowerCase();

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
        ...(message.replyTo ? { ReplyToAddresses: [message.replyTo] } : {}),
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
    return { ok: true, messageId: out.MessageId };
  } catch (error) {
    // The message name only — an SES error can quote the destination and the
    // headers, and this is not the place for either.
    console.error("[email] send failed:", error instanceof Error ? error.name : "unknown");
    return {
      ok: false,
      reason: "rejected",
      message: "The email could not be sent.",
    };
  }
}
