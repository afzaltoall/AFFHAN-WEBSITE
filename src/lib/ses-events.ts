/**
 * What an Amazon SES bounce or complaint event says to stop sending to.
 * Pure: /api/ses/notifications checks the SNS message it arrived in and saves
 * what this returns.
 *
 * Two shapes arrive in the same way: events published by the configuration
 * set ("eventType") and the identity's feedback notifications
 * ("notificationType"). Their bounce and complaint objects are the same.
 *
 * - A permanent bounce: every bounced recipient is suppressed. The address
 *   does not exist or will never take mail, and sending again only damages
 *   the sending reputation.
 * - A complaint: every complaining recipient is suppressed. They marked our
 *   email as spam.
 * - A transient bounce (mailbox full, a server down), a delivery, anything
 *   else: nothing is suppressed.
 *
 * Kept free of path aliases and of other modules, so tests can load it as it is.
 */

export interface Suppression {
  /** Lower-cased address. */
  email: string;
  reason: "BOUNCE" | "COMPLAINT";
  /** SES's bounceSubType, or the complaint's feedback type, when it gives one. */
  detail: string | null;
  /** SES's feedbackId for the event. */
  feedbackId: string | null;
}

const ADDRESS = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** "Name <a@b.com>" or "a@b.com", as a lower-cased address; null when it is not one. */
function address(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const inBrackets = /<([^<>]+)>/.exec(raw);
  const a = (inBrackets ? inBrackets[1] : raw).trim().toLowerCase();
  return ADDRESS.test(a) ? a : null;
}

const recipients = (list: unknown): string[] =>
  Array.isArray(list)
    ? [...new Set(list.map((r) => address((r as { emailAddress?: unknown })?.emailAddress)).filter((a): a is string => a !== null))]
    : [];

export function suppressionsFrom(event: unknown): { kind: string; suppress: Suppression[] } {
  if (!event || typeof event !== "object") return { kind: "unreadable", suppress: [] };
  const e = event as Record<string, unknown>;
  const kind = typeof e.eventType === "string" ? e.eventType : typeof e.notificationType === "string" ? e.notificationType : "unknown";

  if (kind === "Bounce") {
    const b = (e.bounce ?? {}) as Record<string, unknown>;
    if (b.bounceType !== "Permanent") return { kind: `Bounce (${String(b.bounceType ?? "unknown")})`, suppress: [] };
    const detail = typeof b.bounceSubType === "string" ? b.bounceSubType : null;
    const feedbackId = typeof b.feedbackId === "string" ? b.feedbackId : null;
    return { kind: "Bounce (Permanent)", suppress: recipients(b.bouncedRecipients).map((email) => ({ email, reason: "BOUNCE", detail, feedbackId })) };
  }

  if (kind === "Complaint") {
    const c = (e.complaint ?? {}) as Record<string, unknown>;
    const detail = typeof c.complaintFeedbackType === "string" ? c.complaintFeedbackType : typeof c.complaintSubType === "string" ? c.complaintSubType : null;
    const feedbackId = typeof c.feedbackId === "string" ? c.feedbackId : null;
    return { kind: "Complaint", suppress: recipients(c.complainedRecipients).map((email) => ({ email, reason: "COMPLAINT", detail, feedbackId })) };
  }

  return { kind, suppress: [] };
}
