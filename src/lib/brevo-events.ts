import { createHash, timingSafeEqual } from "node:crypto";

// ---------------------------------------------------------------------------
// Brevo's transactional webhook events (app/api/brevo/webhook), read into the
// EmailSuppression rows lib/email.ts checks before every send.
//
// Four events mean an address is not to be mailed again:
//   hard_bounce    the mailbox does not exist, or refuses for good
//   invalid_email  the address cannot be delivered to at all
//   blocked        Brevo would not send to it (its own blocklist)
//   spam           the recipient marked our email as spam: a complaint
// Every other event (delivered, opened, soft_bounce, deferred, ...) is not ours
// to act on and is ignored.
//
// Brevo posts one event per call, or an array of them when its webhook batches.
// Its names are snake_case in what it posts ("hard_bounce") and camelCase where
// a webhook is set up ("hardBounce"); both are read.
//
// No imports beyond node: built-ins, so tests/security can load this directly.
// ---------------------------------------------------------------------------

export interface BrevoSuppression {
  /** Lower-cased. */
  email: string;
  reason: "BOUNCE" | "COMPLAINT";
  /** Which Brevo event it was: "brevo:hard_bounce", "brevo:spam", ... */
  detail: string;
  /** Brevo's message-id for the email the event is about, when given. */
  feedbackId: string | null;
}

const EVENTS: Record<string, { name: string; reason: BrevoSuppression["reason"] }> = {
  hardbounce: { name: "hard_bounce", reason: "BOUNCE" },
  invalidemail: { name: "invalid_email", reason: "BOUNCE" },
  invalid: { name: "invalid_email", reason: "BOUNCE" },
  blocked: { name: "blocked", reason: "BOUNCE" },
  spam: { name: "spam", reason: "COMPLAINT" },
  complaint: { name: "spam", reason: "COMPLAINT" },
};

const ADDRESS = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;

/** The event's address, cleaned: a display name dropped, lower case; null when it is not an address. */
function address(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const bracketed = value.match(/<([^<>]+)>\s*$/);
  const email = (bracketed ? bracketed[1] : value).trim().toLowerCase();
  return email.length <= 254 && ADDRESS.test(email) ? email : null;
}

/**
 * The addresses a webhook call says to suppress, one per address (the latest
 * event for it winning), and the events it carried, for the log.
 */
export function suppressionsFromBrevo(payload: unknown): { events: string[]; suppress: BrevoSuppression[] } {
  const items = Array.isArray(payload) ? payload : [payload];
  const events: string[] = [];
  const byEmail = new Map<string, BrevoSuppression>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    const raw = typeof e.event === "string" ? e.event : "";
    events.push(raw || "(none)");
    const known = EVENTS[raw.toLowerCase().replace(/[^a-z]/g, "")];
    if (!known) continue;
    const email = address(e.email);
    if (!email) continue;
    const messageId = e["message-id"] ?? e.messageId;
    byEmail.set(email, {
      email,
      reason: known.reason,
      detail: `brevo:${known.name}`,
      feedbackId: typeof messageId === "string" && messageId.trim() ? messageId.trim().slice(0, 300) : null,
    });
  }
  return { events, suppress: [...byEmail.values()] };
}

/**
 * Whether a webhook call carries the shared secret (BREVO_WEBHOOK_SECRET).
 * Fails closed: no secret configured, or none given, is false. Compared as
 * digests in constant time, so neither the length nor a prefix leaks.
 */
export function tokenMatches(given: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || !given) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
