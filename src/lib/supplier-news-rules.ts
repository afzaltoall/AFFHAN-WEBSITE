/**
 * When a supplier gets an email about their application (the owner, 2026-10-23: "email on your decision"), kept
 * apart from the sending (lib/supplier-news.ts) and with no imports, so the rules can be tested as they are.
 *
 * News is a status the supplier is told about (being reviewed, accepted, not selected; never "back to new", which
 * is the team's own housekeeping, nor withdrawn, which is the supplier's own doing), or a reply that is new.
 * Measured against what the supplier last saw: the state before the first of a run of changes, so pressing
 * Accepted and then saving a reply is one email that says both.
 */

/** The statuses a supplier is emailed about. */
export const ANNOUNCED_STATUSES = ["REVIEWING", "ACCEPTED", "REJECTED"] as const;

/**
 * How long the team's last change has to stand before the email goes: a run of changes closer together than this
 * (a slip of the finger, a status and then a reply) becomes one email, about where things ended.
 */
export const NEWS_SETTLE_MS = 12_000;

export interface NewsState {
  status: string;
  reply: string | null;
}

export interface News {
  /** The status moved to one the supplier is told about. */
  status: boolean;
  /** A reply is there that the supplier has not seen. */
  reply: boolean;
}

const text = (s: string | null) => (s ?? "").trim();

export function newsOf(before: NewsState, now: NewsState): News {
  return {
    status: now.status !== before.status && (ANNOUNCED_STATUSES as readonly string[]).includes(now.status),
    reply: text(now.reply) !== "" && text(now.reply) !== text(before.reply),
  };
}

/** Whether there is anything to send. */
export const isNews = (news: News) => news.status || news.reply;
