// ---------------------------------------------------------------------------
// The customer-facing status vocabulary, shared by both kinds of inquiry.
//
// It began as the app's alone (hence the MobileInquiry* names, kept so the
// app's route handlers did not have to churn). The website's Inquiry table now
// uses the same four values in its own `customerStatus` column, because the
// account page renders inquiries from both tables through one step-tracker and
// a second vocabulary would have meant a translation layer between them.
//
// This is NOT the website's `Inquiry.status`, which is internal triage —
// new | handled | spam, plus `deleted` for the admin console's soft-delete.
// Those are office shorthand nobody outside sees, and "spam" is not a stage a
// customer moves through. The two columns answer different questions and are
// deliberately kept apart; see the note on the Inquiry model.
//
// The wording below is part of the API contract: the server sends the sentence
// to display rather than leaving each client to invent its own and drift.
// ---------------------------------------------------------------------------

/**
 * The customer's journey (the owner, 2026-11-17: "we confirm only after checking whether we can source it ... then we
 * call the user"): Received the moment it is sent (PENDING); Checked once the team has looked at it and will call
 * (the console's Checked, and any Handled: lib/inquiry-checked.ts); then, after the call, Confirmed, or Closed with the
 * reason. CUSTOM is the team's own words, off that path. IN_PROGRESS was the old third stage ("Sourcing"): rows and
 * older app builds still carry it, so it is still a valid value, told to the customer as Checked; the console no
 * longer offers it.
 */
export const MOBILE_INQUIRY_STATUSES = ["PENDING", "CHECKED", "CONFIRMED", "CLOSED", "CUSTOM", "IN_PROGRESS"] as const;

export type MobileInquiryStatus = (typeof MOBILE_INQUIRY_STATUSES)[number];

export function isMobileInquiryStatus(value: unknown): value is MobileInquiryStatus {
  return typeof value === "string" && (MOBILE_INQUIRY_STATUSES as readonly string[]).includes(value);
}

/**
 * Which table a merged inquiry row came from.
 *
 * The account page shows both in one list, but they are not interchangeable:
 * only a website inquiry carries the customer's own typed message, and only an
 * app inquiry can have its quantity edited afterwards. The client needs to know
 * which it is holding.
 */
export type InquirySource = "WEBSITE" | "APP";

/** A status as the customer is told it: the old IN_PROGRESS is told as Checked. */
export type CustomerStatus = Exclude<MobileInquiryStatus, "IN_PROGRESS">;

// Short label for the status badge.
const LABELS: Record<CustomerStatus, string> = {
  PENDING: "Received",
  CHECKED: "Checked",
  CONFIRMED: "Confirmed",
  CLOSED: "Closed",
  CUSTOM: "Update",
};

// The line under the badge. CUSTOM has none of its own (the admin's note is the
// whole message, which is the point of it), and CLOSED's is only what it says
// when the team gives no reason.
const MESSAGES: Record<CustomerStatus, string> = {
  PENDING: "We have your request.",
  CHECKED: "Our team has checked your request and will call you.",
  CONFIRMED: "Confirmed. Our team will be in touch about the next steps.",
  CLOSED: "This request is closed.",
  CUSTOM: "",
};

/**
 * What the app and the account page render for an inquiry. With CUSTOM the
 * admin's note replaces the message entirely, and with CLOSED the reason does
 * ("We couldn't agree on the price."); with the others it is appended, so a
 * note like "Quote sent to your email" reads as an addition rather than a
 * contradiction.
 */
export function describeStatus(status: string, statusNote: string | null | undefined) {
  const raw: MobileInquiryStatus = isMobileInquiryStatus(status) ? status : "PENDING";
  const s: CustomerStatus = raw === "IN_PROGRESS" ? "CHECKED" : raw;
  const note = statusNote?.trim() || null;
  return {
    status: s,
    label: s === "CUSTOM" && note ? note : LABELS[s],
    message: s === "CUSTOM" ? (note ?? "") : s === "CLOSED" ? (note ?? MESSAGES.CLOSED) : [MESSAGES[s], note].filter(Boolean).join(" "),
    note,
  };
}

// A quantity has to be a whole number a supplier could actually be asked for.
// The ceiling is deliberately generous — this is wholesale sourcing — but not
// unbounded, so a fat-fingered paste cannot land a 12-digit order in the queue.
export const MOQ_MIN = 1;
export const MOQ_MAX = 10_000_000;

export function parseMOQ(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isInteger(n) || n < MOQ_MIN || n > MOQ_MAX) return null;
  return n;
}
