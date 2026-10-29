/**
 * The free China business trip application: its shape, its answers and its
 * rules, in one place that both the form (components/TripApplication) and the
 * API (/api/trip-applications) read, so the browser and the server can never
 * disagree about what a valid application is.
 *
 * One page since 2026-10-29 (the owner, with the list: "NAME, Mobile Number,
 * Country, City, Doing business or Not, Valid passport ... single page edhu
 * matu use panalam indha contents"): six answers and Submit. Asked before and
 * no longer: an email, a website or LinkedIn, nationality, travel to China
 * before, a business profile, "About your business", a company's name, role,
 * category, website and years in business, and what someone planning or
 * exploring meant to build or see. Their columns stay in the table for the
 * applications that answered them (the console shows them where given); new
 * rows leave them empty. One application per person is kept by the account
 * and the mobile number.
 *
 * Deliberately NOT collected: passport numbers, passport expiry, visa status,
 * identity or travel documents of any kind. The trip's Terms and Privacy
 * Policy say these are asked for later, from selected applicants, only where
 * reasonably required; see TRAVEL_DOCUMENTS below and the TripApplication
 * model.
 *
 * NOTHING HERE SCORES, RANKS OR ORDERS APPLICANTS. The answers are for
 * administering the application. The five winners (and any reserves) are
 * drawn at random from the eligible applications (Terms, clause 3); no
 * answer, business or otherwise, has any part in that, and running a business
 * is not a condition of applying.
 */

/**
 * "Doing business or not": the two answers, stored as the application's
 * `businessStatus`. `label` is the answer in full (the console's tooltip),
 * `brief` the same in a few words (the console's filter and rows).
 */
export const BUSINESS_STATUSES = [
  { value: "existing_business", label: "Yes, I run a business", brief: "Runs a business" },
  { value: "no_business_yet", label: "No, not yet", brief: "No business yet" },
] as const;

/**
 * Answers the form offered before and no longer does: "I am planning to start
 * a business" (until 2026-10-29) and "I am looking to expand an existing
 * business" (until 2026-10-28). Applications sent before then carry them, so
 * the team's console still names them and filters by them; a new application
 * may not give one, and the API asks a page opened before the change to apply
 * again.
 */
export const RETIRED_BUSINESS_STATUSES = [
  { value: "planning_business", label: "I am planning to start a business", brief: "Planning to start a business" },
  { value: "expanding_business", label: "I am looking to expand an existing business", brief: "Expanding an existing business" },
] as const;

/** Every answer an application may carry, the ones offered now first. */
export const EVERY_BUSINESS_STATUS = [...BUSINESS_STATUSES, ...RETIRED_BUSINESS_STATUSES] as const;

export type BusinessStatus = (typeof BUSINESS_STATUSES)[number]["value"];

/** One of the answers offered now: the only ones a new application may give. */
export function isBusinessStatus(v: unknown): v is BusinessStatus {
  return BUSINESS_STATUSES.some((s) => s.value === v);
}

/** One of the answers taken out. */
export function isRetiredBusinessStatus(v: unknown): boolean {
  return RETIRED_BUSINESS_STATUSES.some((s) => s.value === v);
}

/** Any answer an application may carry, offered now or taken out (the console's filter). */
export function isKnownBusinessStatus(v: unknown): v is (typeof EVERY_BUSINESS_STATUS)[number]["value"] {
  return EVERY_BUSINESS_STATUS.some((s) => s.value === v);
}

/** The few words for any answer an application carries ("Runs a business"), or "" for none. */
export function businessStatusBrief(v: unknown): string {
  return EVERY_BUSINESS_STATUS.find((s) => s.value === v)?.brief ?? "";
}

/**
 * Document questions beyond the passport's yes or no. All OFF: switch one on
 * only when the confirmed process requires it, and only with the storage,
 * masking and retention rules a passport number needs (none exist yet).
 */
export const TRAVEL_DOCUMENTS = {
  visaStatus: false,
  passportNumber: false,
  passportExpiry: false,
  passportUpload: false,
} as const;

export interface TripApplicationPayload {
  personal: {
    fullName: string;
    /** With its dial code: "+91 9876543210". */
    phone: string;
    country: string;
    city: string;
  };
  business: {
    /** "" until answered. */
    businessStatus: BusinessStatus | "";
  };
  travel: {
    hasPassport: boolean | null;
  };
  /**
   * The trip's three consents (lib/trip-legal.ts, TRIP_CONSENTS): on the website all three are the popup's agreement
   * before the questions (the Privacy Policy; the Terms; and accurate information, which the Terms require, clause 2).
   */
  consent: {
    privacy: boolean;
    accuracy: boolean;
    terms: boolean;
  };
}

/**
 * An application sent without signing in that Cloudflare's silent check did not confirm (it would have wanted a
 * click, could not run, or no token came): taken all the same, never refused for it, and marked so in its `source`
 * for the team (the console shows "Not verified"). Everything else keeps the column's default.
 */
export const SOURCE_NOT_VERIFIED = "Free China Trip Application (not verified)";

/** Field lengths, shared by the inputs' maxLength and the server's check. */
export const LIMITS = {
  name: 100,
  phone: 30,
  country: 100,
  city: 100,
} as const;

/**
 * When applications are taken (Terms, clause 1): from 12 October 2026 to 25
 * November 2026, in India's time, as the countdown keeps it. The first moment
 * of the 12th, IST, to the last moment of the 25th. It opened on 5 October
 * until the owner moved it to the 12th (2026-10-12), the day the applications
 * so far were cleared for a fresh start.
 */
export const APPLICATION_WINDOW = {
  opens: Date.parse("2026-10-12T00:00:00+05:30"),
  /** The first moment after 25 November 2026, IST. */
  closes: Date.parse("2026-11-26T00:00:00+05:30"),
} as const;

export type WindowState = "before" | "open" | "closed";

/**
 * Whether applications are being taken now. Kept by a production build (the
 * live site and its previews), in the browser and again by the API. A
 * development server (next dev, localhost) is always open, so the form can be
 * tried before 12 October.
 */
export function applicationWindow(now = Date.now()): WindowState {
  if (process.env.NODE_ENV !== "production") return "open";
  if (now < APPLICATION_WINDOW.opens) return "before";
  if (now >= APPLICATION_WINDOW.closes) return "closed";
  return "open";
}

export type FieldErrors = Partial<Record<string, string>>;

const need = (v: string, min = 1) => v.trim().length >= min;

/**
 * The rules: the form's on Submit and the server's on every application.
 * Messages are the words the form shows under each field, so they are written
 * for the applicant. `phoneOk` is passed in because the mobile check lives in
 * lib/phone (libphonenumber) and depends on the dial code the applicant chose.
 */
export function validateAll(a: TripApplicationPayload, phoneOk?: boolean): FieldErrors {
  const e: FieldErrors = {};
  const p = a.personal;
  if (!need(p.fullName, 2)) e.fullName = "Please enter your full name.";
  if (!need(p.phone)) e.phone = "Please enter your mobile number.";
  else if (phoneOk === false) e.phone = "That isn't a valid mobile number for the code you chose.";
  if (!need(p.country)) e.country = "Please choose your country.";
  if (!need(p.city)) e.city = "Please enter your city.";
  if (!isBusinessStatus(a.business.businessStatus)) e.businessStatus = "Please choose one.";
  if (a.travel.hasPassport === null) e.hasPassport = "Please choose one.";
  const c = a.consent;
  if (!c.privacy) e.privacy = "Please consent to the Privacy Policy.";
  if (!c.accuracy) e.accuracy = "Please confirm the information is accurate and complete.";
  if (!c.terms) e.terms = "Please agree to the Terms & Conditions.";
  return e;
}
