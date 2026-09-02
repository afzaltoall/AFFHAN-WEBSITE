// ---------------------------------------------------------------------------
// Status vocabulary for inquiries raised in the mobile app.
//
// Separate from the website's Inquiry triage (new | handled | spam). That one
// is internal shorthand nobody outside the office sees. These are shown to the
// customer in the app, so the wording is part of the contract: the API sends
// the sentence to display rather than leaving each client to invent its own and
// drift apart.
// ---------------------------------------------------------------------------

export const MOBILE_INQUIRY_STATUSES = ["PENDING", "CHECKED", "IN_PROGRESS", "CUSTOM"] as const;

export type MobileInquiryStatus = (typeof MOBILE_INQUIRY_STATUSES)[number];

export function isMobileInquiryStatus(value: unknown): value is MobileInquiryStatus {
  return typeof value === "string" && (MOBILE_INQUIRY_STATUSES as readonly string[]).includes(value);
}

// Short label for the status badge.
const LABELS: Record<MobileInquiryStatus, string> = {
  PENDING: "Pending",
  CHECKED: "Checked",
  IN_PROGRESS: "In Progress",
  CUSTOM: "Update",
};

// The line under the badge. CUSTOM has none of its own — the admin's note is
// the whole message, which is the point of it.
const MESSAGES: Record<MobileInquiryStatus, string> = {
  PENDING: "Our team will contact you shortly.",
  CHECKED: "Our team has reviewed your inquiry.",
  IN_PROGRESS: "We are sourcing this for you.",
  CUSTOM: "",
};

/**
 * What the app renders for an inquiry. With CUSTOM the admin's note replaces
 * the message entirely; with the fixed three it is appended, so a note like
 * "Quote sent to your email" reads as an addition rather than a contradiction.
 */
export function describeStatus(status: string, statusNote: string | null | undefined) {
  const s: MobileInquiryStatus = isMobileInquiryStatus(status) ? status : "PENDING";
  const note = statusNote?.trim() || null;
  return {
    status: s,
    label: s === "CUSTOM" && note ? note : LABELS[s],
    message: s === "CUSTOM" ? (note ?? "") : [MESSAGES[s], note].filter(Boolean).join(" "),
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
