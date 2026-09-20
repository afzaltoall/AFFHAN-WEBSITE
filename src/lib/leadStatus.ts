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

/**
 * What a member of staff can record. Four, and only four.
 *
 *   IN_PROGRESS   they have picked it up and are working it
 *   LEAD          the customer agreed — terminal, and the good end
 *   NO_LEAD       the customer declined — terminal, and the closed end
 *   NOT_ATTENDED  they cannot take this one on. NOT terminal: it hands the
 *                 customer to somebody else (the rotation queue).
 *
 * The previous vocabulary was CONVERTED / NOT_CONVERTED / FOLLOW_UP /
 * IN_PROGRESS. LEAD and NO_LEAD are the same two ends of a deal under the
 * names the office uses for them; FOLLOW_UP is gone, because "waiting on
 * somebody" is what IN_PROGRESS already means here.
 */
export const LEAD_STATUSES = ["IN_PROGRESS", "LEAD", "NO_LEAD", "NOT_ATTENDED"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/**
 * Written by the system, never by a person.
 *
 * A customer nobody took on, after the rotation has offered them to the whole
 * team and given up. It is not an outcome anybody reached, which is why it is
 * not in the list above: no button offers it, the recording route rejects it,
 * and it is shown in the admin's own views rather than on a workspace.
 */
export const INVALID = "INVALID" as const;

/** Everything that can legitimately sit in StatusUpdate.status. */
export type StoredLeadStatus = LeadStatus | typeof INVALID;

export const LEAD_STATUS_META: Record<
  StoredLeadStatus,
  { label: string; hint: string; chip: string; dot: string }
> = {
  IN_PROGRESS: {
    label: "In progress",
    hint: "Working it now",
    chip: "bg-sky-500/10 text-sky-700",
    dot: "bg-sky-500",
  },
  LEAD: {
    label: "Lead",
    hint: "They agreed — this is business",
    chip: "bg-emerald-500/10 text-emerald-700",
    dot: "bg-emerald-500",
  },
  NO_LEAD: {
    label: "No lead",
    hint: "They declined, and why",
    chip: "bg-red-500/10 text-red-700",
    dot: "bg-red-500",
  },
  NOT_ATTENDED: {
    label: "Not attended",
    hint: "You cannot take this one on",
    chip: "bg-amber-500/10 text-amber-700",
    dot: "bg-amber-500",
  },
  INVALID: {
    label: "Invalid",
    hint: "Offered to the team and taken on by nobody",
    chip: "bg-slate-700/10 text-slate-700",
    dot: "bg-slate-700",
  },
};

/**
 * The old vocabulary, read as the new one.
 *
 * The table holds whatever was recorded before this change, and the site is
 * live while it ships: a row written from the old workspace an hour before the
 * deploy is a row the new build has to read. So the old values are translated
 * here, on the way out of the database, and nothing anywhere renders an
 * unrecognised status.
 *
 * FOLLOW_UP meant "waiting on the customer, or on us", which is an open lead
 * somebody is holding — IN_PROGRESS in the new vocabulary — so that is where
 * it goes. scripts/migrate_lead_statuses.mjs rewrites the stored rows to
 * match; once it has run everywhere this map is only a safety net, and can go.
 */
const LEGACY_STATUS: Record<string, StoredLeadStatus> = {
  CONVERTED: "LEAD",
  NOT_CONVERTED: "NO_LEAD",
  FOLLOW_UP: "IN_PROGRESS",
};

/** A stored value as this build understands it, old vocabulary included. */
export function normalizeStatus(value: string | null | undefined): string {
  if (!value) return "";
  return LEGACY_STATUS[value] ?? value;
}

/**
 * A value a person may record. INVALID is deliberately not one, and neither is
 * anything from the old vocabulary: this is what the recording route accepts,
 * and it should accept exactly what the buttons offer.
 */
export function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && (LEAD_STATUSES as readonly string[]).includes(value);
}

/** A value that may legitimately be stored, INVALID and the old names included. */
export function isStoredLeadStatus(value: unknown): value is StoredLeadStatus {
  if (typeof value !== "string") return false;
  const v = normalizeStatus(value);
  return (LEAD_STATUSES as readonly string[]).includes(v) || v === INVALID;
}

/** The label for a stored value, including one this build does not know. */
export function leadStatusLabel(value: string): string {
  const v = normalizeStatus(value);
  return isStoredLeadStatus(v) ? LEAD_STATUS_META[v as StoredLeadStatus].label : v.replace(/_/g, " ").toLowerCase();
}

export function leadStatusChip(value: string): string {
  const v = normalizeStatus(value);
  return isStoredLeadStatus(v) ? LEAD_STATUS_META[v as StoredLeadStatus].chip : "bg-black/[0.05] text-[#86868b]";
}

/**
 * Is the moment this was recorded the recorder's business?
 *
 * For everything except IN_PROGRESS, yes: when a deal was won or lost is part
 * of the record and the person who wrote it should see it.
 *
 * IN_PROGRESS is the exception. The office needs to know exactly when somebody
 * picked a customer up — it is how "who is actually working this, and since
 * when" gets answered without asking — but showing a salesperson their own
 * clock turns their own note into a stopwatch pointed at them. So the admin
 * views print the exact time and the workspace prints none.
 */
export function showsTimeToStaff(status: string): boolean {
  return !isInProgress(status);
}

/** Somebody has this customer in hand right now. */
export function isInProgress(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "IN_PROGRESS";
}

/** How long a note may be. Long enough for the story, short enough to read. */
export const LEAD_NOTE_MAX = 1000;

/**
 * A lead nobody has written against yet.
 *
 * Not a status anybody records — there is no NONE row in the table — so it is
 * computed wherever it is shown. Neutral on purpose: "nothing yet" should read
 * as the absence of an outcome, not as a sixth one.
 */
export const NOT_STARTED = "NONE" as const;
export type LeadOutcomeKey = StoredLeadStatus | typeof NOT_STARTED;

export const NOT_STARTED_META = {
  label: "Not started",
  hint: "Nobody has recorded anything yet",
  chip: "bg-black/[0.05] text-[#6e6e73]",
  dot: "bg-[#8e8e93]",
} as const;

export function outcomeMeta(key: LeadOutcomeKey) {
  return key === NOT_STARTED ? NOT_STARTED_META : LEAD_STATUS_META[key];
}

/**
 * The order outcomes are shown in when they sit side by side — tiles, filters,
 * and the segments of a breakdown bar: won, passed on, working, lost, dead,
 * untouched.
 *
 * Re-checked as adjacent stacked segments when LEAD/NO_LEAD/NOT_ATTENDED
 * replaced the old vocabulary, because the order itself changed. The worst
 * neighbouring pair is emerald beside amber under protanopia, exactly as it
 * was before this change; every other neighbour is further apart than that,
 * and no neighbour drops below 31 in normal vision.
 *
 * Two placements are deliberate rather than aesthetic. LEAD cannot sit next to
 * IN_PROGRESS: emerald beside sky is the worst pair in the whole palette under
 * tritanopia, so NOT_ATTENDED goes between them. And INVALID is a dark slate
 * rather than another grey, because the greys it would otherwise sit beside —
 * "Not started" — are what it must not be mistaken for.
 */
export const OUTCOME_ORDER: readonly LeadOutcomeKey[] = [
  "LEAD",
  "NOT_ATTENDED",
  "IN_PROGRESS",
  "NO_LEAD",
  INVALID,
  NOT_STARTED,
];

/**
 * The same order, without INVALID.
 *
 * What the workspace shows: tiles, the outcome filter, a person's own
 * breakdown. INVALID is the system's word for a customer the whole team
 * passed on, and it is the office's business, not a salesperson's.
 */
export const STAFF_OUTCOME_ORDER: readonly LeadOutcomeKey[] = OUTCOME_ORDER.filter((k) => k !== INVALID);

/** The outcome a lead's newest update says, or NOT_STARTED. */
export function outcomeOf(latestStatus: string | null | undefined): LeadOutcomeKey {
  const v = normalizeStatus(latestStatus);
  return isStoredLeadStatus(v) ? (v as StoredLeadStatus) : NOT_STARTED;
}
