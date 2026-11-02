/**
 * The Free China Trip's employee referral task (the owner, 2026-11-02): every employee has a link carrying their code;
 * an application from somebody who came through it earns them `pointsPerReferral` points (100) once the team counts
 * it, a point being `rupeesPerPoint` rupees (1), towards a target of `target` applications (100). Customers are never
 * shown a code or asked for one. What both sides need: how a code is read, the states, what counts and what it is
 * worth. No imports, so the form and the console can use it in the browser. The server's half is
 * lib/server/trip-referrals.ts.
 */

/** As a code is stored and compared: upper-case letters and digits, so "rahim7" in a link is RAHIM7. */
export function normalizeReferralCode(value: unknown): string {
  return typeof value === "string" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, REFERRAL_CODE_MAX) : "";
}
export const REFERRAL_CODE_MAX = 20;

/**
 * Where an application's code stands. "waiting" until the team decides; "counted" earns its points; "not_counted"
 * never does (the team said no, or it came while the task was off).
 */
export const REFERRAL_STATES = ["waiting", "counted", "not_counted"] as const;
export type ReferralState = (typeof REFERRAL_STATES)[number];
export const isReferralState = (v: unknown): v is ReferralState => typeof v === "string" && (REFERRAL_STATES as readonly string[]).includes(v);
export const REFERRAL_STATE_LABEL: Record<ReferralState, string> = { waiting: "Waiting", counted: "Counted", not_counted: "Not counted" };

/** The task's defaults, until the console saves its own. */
export const REFERRAL_DEFAULTS = { enabled: true, pointsPerReferral: 100, rupeesPerPoint: 1, target: 100 } as const;

/**
 * Whether an application earns its points: the team counted it, and it is not spam or deleted. Marking it spam or
 * deleting it later takes the points back, without touching its state, so restoring it gives them back.
 */
export function referralCounts(a: { referralState: string | null; status: string }): boolean {
  return a.referralState === "counted" && a.status !== "spam" && a.status !== "deleted";
}

/** Whether it is still to be decided: waiting, and not spam or deleted. */
export function referralWaiting(a: { referralState: string | null; status: string }): boolean {
  return a.referralState === "waiting" && a.status !== "spam" && a.status !== "deleted";
}

/** What the employee shares: the trip's page with their code, which the application then fills in by itself. */
export const referralLink = (code: string) => `https://affhan.com/free-china-trip/?ref=${encodeURIComponent(code)}`;

/** Where a code from a link waits in the browser until the application is filled in, and for how long. */
export const REFERRAL_STORAGE_KEY = "affhan:trip-ref";
export const REFERRAL_STORAGE_DAYS = 30;

/** India's calendar date of an instant, as a date field holds it (YYYY-MM-DD). */
export const istDate = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
/** The first moment of an Indian calendar date, and the first moment after it (an end date counts all day). */
export const istDayStart = (day: string) => new Date(`${day}T00:00:00+05:30`);
export const istDayAfter = (day: string) => new Date(Date.parse(`${day}T00:00:00+05:30`) + 86_400_000);
/** The last day an end (the first moment after it) still counts, as a date field holds it. */
export const istLastDay = (endIso: string) => istDate(new Date(Date.parse(endIso) - 1).toISOString());

/** Rupees, as the office writes them: ₹3,700. */
export const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** A mobile number as an employee sees a customer's: the code and the last two digits ("+91 98•••••12"). */
export function maskPhone(phone: string): string {
  const [code, ...rest] = phone.trim().split(/\s+/);
  const digits = rest.join("").replace(/\D/g, "");
  if (!rest.length || digits.length < 4) return phone.replace(/\d(?=\d{2})/g, "•");
  return `${code} ${digits.slice(0, 2)}${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-2)}`;
}
