// ---------------------------------------------------------------------------
// The sales outcome recorded against a lead.
//
// A THIRD status vocabulary on these rows, and deliberately its own: Inquiry
// .status is internal triage (new | handled | spam), Inquiry.customerStatus is
// what the customer is shown (PENDING | CHECKED | ...), and this is what the
// salesperson found out. See the note on the StatusUpdate model in
// schema.prisma — the three answer different questions and must not be
// conflated in the UI either.
//
// No imports, so the cards can use it in the browser.
// ---------------------------------------------------------------------------

export const LEAD_STATUSES = ["IN_PROGRESS", "CONVERTED", "NOT_CONVERTED", "FOLLOW_UP"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_META: Record<
  LeadStatus,
  { label: string; hint: string; chip: string; dot: string }
> = {
  IN_PROGRESS: {
    label: "In progress",
    hint: "Working it now",
    chip: "bg-sky-500/10 text-sky-700",
    dot: "bg-sky-500",
  },
  CONVERTED: {
    label: "Converted",
    hint: "Became an order",
    chip: "bg-emerald-500/10 text-emerald-700",
    dot: "bg-emerald-500",
  },
  NOT_CONVERTED: {
    label: "Not converted",
    hint: "Went nowhere, and why",
    chip: "bg-red-500/10 text-red-700",
    dot: "bg-red-500",
  },
  FOLLOW_UP: {
    label: "Follow-up needed",
    hint: "Waiting on the customer, or on us",
    chip: "bg-amber-500/10 text-amber-700",
    dot: "bg-amber-500",
  },
};

export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value);
}

/** The label for a stored value, including one this build does not know. */
export function leadStatusLabel(value: string): string {
  return isLeadStatus(value) ? LEAD_STATUS_META[value].label : value.replace(/_/g, " ").toLowerCase();
}

export function leadStatusChip(value: string): string {
  return isLeadStatus(value) ? LEAD_STATUS_META[value].chip : "bg-black/[0.05] text-[#86868b]";
}

/** How long a note may be. Long enough for the story, short enough to read. */
export const LEAD_NOTE_MAX = 1000;
