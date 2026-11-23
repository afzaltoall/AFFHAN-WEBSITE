/**
 * The Free China Trip's employee referral task (the owner, 2026-11-02): every employee has a link carrying their code;
 * an application from somebody who came through it earns them `pointsPerReferral` points (100) once the team counts
 * it, a point being `rupeesPerPoint` rupees (1), towards a target of `target` applications (100). Customers are never
 * shown a code or asked for one. What both sides need: how a code is read, the states, what counts and what it is
 * worth, and the ID proof such an applicant adds. No imports, so the form and the console can use it in the browser.
 * The server's half is lib/server/trip-referrals.ts (and lib/server/trip-documents.ts for the files).
 */

/** As a code is stored and compared: upper-case letters and digits, so "rahim7" in a link is RAHIM7. */
export function normalizeReferralCode(value: unknown): string {
  return typeof value === "string" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, REFERRAL_CODE_MAX) : "";
}
export const REFERRAL_CODE_MAX = 20;
/** The shortest code a link is read with, and the console will set (2026-11-03). */
export const REFERRAL_CODE_MIN = 3;

/**
 * Where an application's code stands. "counted" earns its points, and is where it starts (2026-11-02: it counts as it
 * arrives); "not_counted" never does (the team took it out, or it came while the task was off). "waiting" is an older
 * application's, still to be decided. "wrong_document" never counts either: the team looked at its ID proof and it is
 * not an ID, or not this applicant's (2026-11-23, the owner: "some of them applied wrong document like some other
 * images"); a "not counted" with its reason, which Employee tasks' ID proofs view lists, and Count undoes.
 */
export const REFERRAL_STATES = ["waiting", "counted", "not_counted", "wrong_document"] as const;
export type ReferralState = (typeof REFERRAL_STATES)[number];
export const isReferralState = (v: unknown): v is ReferralState => typeof v === "string" && (REFERRAL_STATES as readonly string[]).includes(v);
export const REFERRAL_STATE_LABEL: Record<ReferralState, string> = { waiting: "Waiting", counted: "Counted", not_counted: "Not counted", wrong_document: "Wrong document" };
/** An application's referral standing in words, for any state stored (an unknown one reads as not counted). */
export const referralStateLabel = (state: string | null) => (isReferralState(state) ? REFERRAL_STATE_LABEL[state] : "Not counted");

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

/**
 * What the employee shares: the application itself with their code (the owner, 2026-11-02: the link asks the Terms
 * and Privacy Policy first, then the application). Links made for the trip's page before then are sent on to it
 * (proxy.ts).
 */
export const referralLink = (code: string) => `https://affhan.com/free-china-trip/apply/?ref=${encodeURIComponent(code)}`;

/**
 * Where a code from a link waits until the application is sent: this visit's tab (sessionStorage), never a later visit
 * (the owner, 2026-11-05: "employee link moolama varangaluku matu dha documents pathi kekanum ... normal web la vandhu
 * china trip clik pani apply panranvangaluku document kekakoodadhu"). It was kept 30 days (localStorage), so someone who
 * had once opened a link and came back through the site was asked for ID proof and credited to that link; that key is
 * cleared wherever the trip's pages open.
 */
export const REFERRAL_STORAGE_KEY = "affhan:trip-ref";
/** Sent on window when a link's code has just been kept, so an application already open picks it up. */
export const REFERRAL_EVENT = "affhan:trip-ref-kept";
/** Sent on window when the server has answered that a link credits nobody, so the application forgets it. */
export const REFERRAL_DROPPED_EVENT = "affhan:trip-ref-dropped";

/**
 * The employee's code in an address's query (?ref=RAHIM7), as the application keeps it; "" when there is none. Read
 * straight from the address by the form too (2026-11-04), so its ID proof never waits on the server or on storage.
 */
export function referralFromSearch(search: string): string {
  const code = normalizeReferralCode(new URLSearchParams(search).get("ref"));
  return code.length >= REFERRAL_CODE_MIN ? code.slice(0, REFERRAL_CODE_MAX) : "";
}

/**
 * The ID proof an applicant who came through an employee's link must add (the owner, 2026-11-02; asked of nobody else),
 * one of the five below (ID_PROOFS, 2026-11-03). A photo or a PDF, up to three files (an Aadhaar's two sides), each up
 * to 10 MB. The form sends the keys the server made for its uploads (lib/server/trip-documents.ts).
 */
export const ID_DOCUMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type IdDocumentType = (typeof ID_DOCUMENT_TYPES)[number];
export const isIdDocumentType = (v: unknown): v is IdDocumentType => typeof v === "string" && (ID_DOCUMENT_TYPES as readonly string[]).includes(v);
export const ID_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const ID_DOCUMENTS_MAX = 3;
export const idDocumentExtension = (type: IdDocumentType) => ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" })[type];
/**
 * The IDs a link applicant may add, and no other (the owner, 2026-11-03: "aadhar / pan / voter id / license / passport
 * ... only these, nothing else"; 2026-11-04: "create one more emirates id document", then "insert one more other id
 * thats it": Other ID, any other photo ID, the file named only that): they choose which, then add a photo or a PDF of
 * it; `sides` when it has a back to add as well. The choice is written into the upload's key (docs/<id>/<uuid>.<extension>), as its type is in the
 * extension, so the console can name every file without a column of its own.
 */
export const ID_PROOFS = [
  { id: "aadhaar", label: "Aadhaar", sides: true },
  { id: "pan", label: "PAN card", sides: false },
  { id: "voter", label: "Voter ID", sides: true },
  { id: "licence", label: "Driving licence", sides: true },
  { id: "passport", label: "Passport", sides: false },
  { id: "emirates", label: "Emirates ID", sides: true },
  { id: "other", label: "Other ID", sides: true },
] as const;
export type IdProof = (typeof ID_PROOFS)[number]["id"];
export const isIdProof = (v: unknown): v is IdProof => typeof v === "string" && ID_PROOFS.some((p) => p.id === v);
export const idProofLabel = (id: IdProof) => ID_PROOFS.find((p) => p.id === id)?.label ?? id;
const ID_DOCUMENT_KEY = new RegExp(
  `^docs/(?:(${ID_PROOFS.map((p) => p.id).join("|")})/)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png|webp|pdf)$`,
);
/** A key the server made for an upload: docs/<id>/<uuid>.<extension>, or docs/<uuid>.<extension> from before the
 *  five (2026-11-02/03), which names no ID. */
export const isIdDocumentKey = (v: unknown): v is string => typeof v === "string" && ID_DOCUMENT_KEY.test(v);
/** The ID a key's upload was added as, or null for one from before the five. */
export const idProofOfKey = (key: string): IdProof | null => {
  const id = ID_DOCUMENT_KEY.exec(key)?.[1];
  return isIdProof(id) ? id : null;
};
/** The type a key's extension stands for. */
export const idDocumentTypeOfKey = (key: string): IdDocumentType | null => ID_DOCUMENT_TYPES.find((t) => key.endsWith(`.${idDocumentExtension(t)}`)) ?? null;
/**
 * A file this small (under 30 KB) is rarely a readable photo of an ID: Employee tasks' ID proofs view offers them as a
 * filter of their own (2026-11-23, the owner: "some of them applied wrong document"; 55 of 4,281 on that day).
 */
export const ID_PROOF_SMALL_BYTES = 30_000;
/** The form's words, and the server's, when the proof is missing. */
export const ID_DOCUMENT_NEEDED = "Please add your ID: Aadhaar, PAN card, Voter ID, driving licence or passport.";
/** When a file is added before saying which of the five it is. */
export const ID_PROOF_NEEDED = "Choose which ID you are adding.";

/** India's calendar date of an instant, as a date field holds it (YYYY-MM-DD). */
export const istDate = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
/** The first moment of an Indian calendar date, and the first moment after it (an end date counts all day). */
export const istDayStart = (day: string) => new Date(`${day}T00:00:00+05:30`);
export const istDayAfter = (day: string) => new Date(Date.parse(`${day}T00:00:00+05:30`) + 86_400_000);
/** The last day an end (the first moment after it) still counts, as a date field holds it. */
export const istLastDay = (endIso: string) => istDate(new Date(Date.parse(endIso) - 1).toISOString());

/** A date field's day as the staff pages write it: "25 Nov 2026". */
const fmtTaskDay = (day: string) =>
  new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** The task's dates as My referrals and Team tasks say them ("3 Nov 2026 to 25 Nov 2026", "until …", "from …"), or null. */
export function referralTaskDates(s: { startsAt: string | null; endsAt: string | null }): string | null {
  if (s.startsAt && s.endsAt) return `${fmtTaskDay(istDate(s.startsAt))} to ${fmtTaskDay(istLastDay(s.endsAt))}`;
  if (s.endsAt) return `until ${fmtTaskDay(istLastDay(s.endsAt))}`;
  if (s.startsAt) return `from ${fmtTaskDay(istDate(s.startsAt))}`;
  return null;
}

/** Rupees, as the office writes them: ₹3,700. */
export const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * Team tasks (the owner, 2026-11-18: "show the all tasks of works to employees everyone in there employee page overall
 * tasks status so they can see everyone status and theres too"): every employee's line on the referral task, for every
 * employee to see. A name and three figures, nothing else: no email, no code, no points or rupees, and nothing of the
 * applicants, who are only ever shown to the employee whose link they came through (the trip's Privacy Policy,
 * section 5). The server counts the applications by employee, state and status (lib/server/trip-referrals.ts).
 */
export interface TeamRow {
  employeeId: string;
  name: string;
  /** Applications through their link, not deleted (as Applied in Employee tasks). */
  referred: number;
  /** Those that count (referralCounts). */
  counted: number;
  /** Their own target where the console gave them one, the task's otherwise. */
  target: number;
}

/** One count of applications that came with one employee's code, in one state and one office status. */
export interface TeamCount {
  referrerId: string | null;
  referralState: string | null;
  status: string;
  n: number;
}

/** Everyone's line from the counts, best first: the most counted, then the most applied, then by name. */
export function teamRows(employees: { id: string; name: string }[], counts: TeamCount[], targets: Map<string, number>, taskTarget: number): TeamRow[] {
  const of = new Map<string, { referred: number; counted: number }>();
  for (const c of counts) {
    if (!c.referrerId || c.status === "deleted") continue;
    const t = of.get(c.referrerId) ?? { referred: 0, counted: 0 };
    t.referred += c.n;
    if (referralCounts(c)) t.counted += c.n;
    of.set(c.referrerId, t);
  }
  return employees
    .map((e) => ({ employeeId: e.id, name: e.name, referred: of.get(e.id)?.referred ?? 0, counted: of.get(e.id)?.counted ?? 0, target: targets.get(e.id) ?? taskTarget }))
    .sort((a, b) => b.counted - a.counted || b.referred - a.referred || a.name.localeCompare(b.name));
}

/**
 * Each line's place, by what it has counted: the same count, the same place (1, 2, 2, 4); none until something counts,
 * so a team just starting is not told it is all in first place.
 */
export const teamPlaces = (rows: { counted: number }[]): (number | null)[] =>
  rows.map((r) => (r.counted > 0 ? 1 + rows.filter((x) => x.counted > r.counted).length : null));

/** What the team has done together: everyone's counted against all their targets, and how many have reached theirs. */
export function teamTotals(rows: TeamRow[]) {
  const counted = rows.reduce((s, r) => s + r.counted, 0);
  const target = rows.reduce((s, r) => s + r.target, 0);
  return {
    employees: rows.length,
    referred: rows.reduce((s, r) => s + r.referred, 0),
    counted,
    target,
    reached: rows.filter((r) => r.counted >= r.target).length,
    toGo: Math.max(0, target - counted),
  };
}

/** How far a count is towards a target, for a bar: from 0 to 1, never past its end. */
export const targetShare = (counted: number, target: number) => (target > 0 ? Math.min(1, counted / target) : 1);

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 101st, 111th. */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  return `${n}${teen ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
}

/** A mobile number as an employee sees a customer's: the code and the last two digits ("+91 98•••••12"). */
export function maskPhone(phone: string): string {
  const [code, ...rest] = phone.trim().split(/\s+/);
  const digits = rest.join("").replace(/\D/g, "");
  if (!rest.length || digits.length < 4) return phone.replace(/\d(?=\d{2})/g, "•");
  return `${code} ${digits.slice(0, 2)}${"•".repeat(Math.max(0, digits.length - 4))}${digits.slice(-2)}`;
}
