// ---------------------------------------------------------------------------
// Brevo's transactional email API, over plain fetch (no SDK).
//
//   POST https://api.brevo.com/v3/smtp/email     header api-key: BREVO_API_KEY
//
// The sender is BREVO_SENDER_EMAIL (noreply@mail.affhan.com, verified in Brevo,
// on a domain Brevo has authenticated: DKIM and DMARC), named BREVO_SENDER_NAME.
// Brevo refuses a send from any sender it has not verified, so nothing is
// hard-coded here: without both variables nothing is sent at all.
//
// This knows how to put one message on the wire and nothing else. The
// suppression list, the reply-to and what a failure means for the caller are
// lib/email.ts's.
// ---------------------------------------------------------------------------

const API = "https://api.brevo.com/v3";
const SEND_TIMEOUT_MS = 10_000;

function credentials(): { apiKey: string; sender: { email: string; name: string } } | null {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const email = process.env.BREVO_SENDER_EMAIL?.trim();
  if (!apiKey || !email) return null;
  return { apiKey, sender: { email, name: process.env.BREVO_SENDER_NAME?.trim() || "AFFHAN Group" } };
}

export function brevoConfigured(): boolean {
  return credentials() !== null;
}

/** Which of Brevo's variables are missing, by name only (never a value). */
export function brevoMissing(): string[] {
  return [!process.env.BREVO_API_KEY?.trim() && "BREVO_API_KEY", !process.env.BREVO_SENDER_EMAIL?.trim() && "BREVO_SENDER_EMAIL"].filter(
    (x): x is string => Boolean(x),
  );
}

export interface BrevoMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo: string;
}

export type BrevoSendResult = { ok: true; messageId: string | undefined } | { ok: false; status: number | null };

/**
 * One message. Never throws. On failure, Brevo's HTTP status (null when it was
 * not reached) and its error code go to the log; its message does not, as it
 * can quote the recipient.
 */
export async function brevoSend(message: BrevoMessage): Promise<BrevoSendResult> {
  const c = credentials();
  if (!c) return { ok: false, status: null };
  try {
    const res = await fetch(`${API}/smtp/email`, {
      method: "POST",
      headers: { "api-key": c.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: c.sender,
        to: [{ email: message.to }],
        replyTo: { email: message.replyTo },
        subject: message.subject,
        textContent: message.text,
        ...(message.html ? { htmlContent: message.html } : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as { messageId?: string; code?: string } | null;
    if (!res.ok) {
      console.error(`[brevo] send refused: HTTP ${res.status}${body?.code ? ` (${body.code})` : ""}`);
      return { ok: false, status: res.status };
    }
    return { ok: true, messageId: body?.messageId };
  } catch (error) {
    console.error("[brevo] send failed before an answer:", error instanceof Error ? error.name : "unknown");
    return { ok: false, status: null };
  }
}

/**
 * Keeps the API key in use. Brevo expires a key that has gone 90 days without
 * a call, and a quiet quarter with no password reset would be enough, so the
 * daily cron run (app/api/cron/leads/rotate) makes one: GET /v3/account, the
 * cheapest authenticated read there is. Never throws; a failure is logged
 * (status and code only) and nothing else, and a success is silent. What the
 * account answers is not read.
 */
export async function brevoKeepAlive(): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[brevo] keep-alive skipped: BREVO_API_KEY is not set.");
    return;
  }
  try {
    const res = await fetch(`${API}/account`, {
      headers: { "api-key": apiKey, accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { code?: string } | null;
      console.error(`[brevo] keep-alive refused: HTTP ${res.status}${body?.code ? ` (${body.code})` : ""}`);
      return;
    }
    await res.body?.cancel();
  } catch (error) {
    console.error("[brevo] keep-alive failed before an answer:", error instanceof Error ? error.name : "unknown");
  }
}
