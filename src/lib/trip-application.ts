/**
 * The free China business trip application: its shape, its option lists and
 * its rules, in one place that both the form (components/TripApplication) and
 * the API (/api/trip-applications) read, so the browser and the server can
 * never disagree about what a valid application is.
 *
 * PLACEHOLDER LIST. BUSINESS_CATEGORIES is a working list, not an approved
 * one; swap it here and nothing else changes (see
 * components/TripApplication/README.md).
 *
 * Four steps since 2026-10-28: about you, the business journey, travel, the
 * review. The business profile step (interests, products of interest, what
 * to explore) and "About your business" were taken out by the owner ("we
 * don't need those details"); their columns stay in the table, for the
 * applications that answered them, and are left empty from then on. The
 * same day the business journey lost two of its four options and every
 * question but a company's name, role and category ("from now on dont ask
 * these question"): see BUSINESS_FIELDS. On 2026-10-29 step 01 stopped asking
 * for an email address and a website or LinkedIn, and step 03 for travel to
 * China before ("we dont need email"): one application per person is kept by
 * the account and the mobile number.
 *
 * Deliberately NOT collected: passport numbers, passport expiry, visa status,
 * identity or travel documents of any kind. The trip's Terms and Privacy
 * Policy say these are asked for later, from selected applicants, only where
 * reasonably required; see TRAVEL_DOCUMENTS below and the TripApplication
 * model.
 *
 * NOTHING HERE SCORES, RANKS OR ORDERS APPLICANTS. The answers are for
 * administering the application and knowing what each applicant is looking
 * for. The five winners (and any reserves) are drawn at random from the
 * eligible applications (Terms, clause 3); no answer, business or otherwise,
 * has any part in that, and running a business is not a condition of
 * applying.
 */

export const BUSINESS_CATEGORIES = [
  "Apparel & Textiles",
  "Electronics & Electrical",
  "Home, Furniture & Decor",
  "Hardware & Tools",
  "Building Materials",
  "Machinery & Industrial",
  "Automotive Parts",
  "Beauty & Personal Care",
  "Health & Medical Supplies",
  "Toys, Baby & Kids",
  "Sports & Outdoor",
  "Jewellery & Accessories",
  "Bags & Footwear",
  "Packaging & Printing",
  "Food, Agriculture & FMCG",
  "Gifts & Stationery",
  "E-commerce / Online Retail",
  "Wholesale & Distribution",
  "Other",
] as const;

/**
 * Step 02's first question, "What best describes you?": where the applicant
 * is in their business journey. Anyone may apply, with a business or without
 * one; the answer only decides what step 02 asks next (BUSINESS_FIELDS).
 * `label` is the option as the form offers it, `brief` the same in a few
 * words (the review, the team's console).
 */
export const BUSINESS_STATUSES = [
  { value: "existing_business", label: "I currently run a business", brief: "Runs a business" },
  { value: "planning_business", label: "I am planning to start a business", brief: "Planning to start a business" },
] as const;

/**
 * The two options the form offered until 2026-10-28, when the owner took them
 * out. Applications sent before then carry them, so the team's console still
 * names them and filters by them; a new application may not choose one, and
 * the API asks a page opened before the change to choose again.
 */
export const RETIRED_BUSINESS_STATUSES = [
  { value: "expanding_business", label: "I am looking to expand an existing business", brief: "Expanding an existing business" },
  { value: "no_business_yet", label: "I don't have a business yet — I'm exploring opportunities", brief: "Exploring opportunities" },
] as const;

/** Every journey an application may carry, the ones offered now first. */
export const EVERY_BUSINESS_STATUS = [...BUSINESS_STATUSES, ...RETIRED_BUSINESS_STATUSES] as const;

export type BusinessStatus = (typeof BUSINESS_STATUSES)[number]["value"];

/** One of the options offered now: the only answers a new application may give. */
export function isBusinessStatus(v: unknown): v is BusinessStatus {
  return BUSINESS_STATUSES.some((s) => s.value === v);
}

/** One of the options taken out on 2026-10-28. */
export function isRetiredBusinessStatus(v: unknown): boolean {
  return RETIRED_BUSINESS_STATUSES.some((s) => s.value === v);
}

/** Any journey an application may carry, offered now or taken out (the console's filter). */
export function isKnownBusinessStatus(v: unknown): v is (typeof EVERY_BUSINESS_STATUS)[number]["value"] {
  return EVERY_BUSINESS_STATUS.some((s) => s.value === v);
}

/** The few words for any journey an application carries ("Runs a business"), or "" for none. */
export function businessStatusBrief(v: unknown): string {
  return EVERY_BUSINESS_STATUS.find((s) => s.value === v)?.brief ?? "";
}

/** Step 02's answers after the first question. */
export const BUSINESS_FIELD_KEYS = ["companyName", "role", "businessCategory"] as const;
export type BusinessFieldKey = (typeof BUSINESS_FIELD_KEYS)[number];

/**
 * The answers each option asks for, in the order step 02 shows them. Every
 * other business answer is not shown, not checked, not reviewed and not sent.
 *
 *   existing: company name, role, category
 *   planning: nothing more; a click or a tap on it goes straight on to step 03
 *
 * Until 2026-10-28 step 02 also asked a company's website and years in
 * business; "planning" asked a business or brand name, a category or area,
 * what they plan to build and a website; and the two options taken out asked
 * what "existing" did, or an area of interest and what they would like to
 * explore in China. The owner took all of it out. Its columns stay in the
 * table for the applications that answered them (the console shows them
 * there); new rows leave them empty.
 */
export const BUSINESS_FIELDS: Record<BusinessStatus, readonly BusinessFieldKey[]> = {
  existing_business: ["companyName", "role", "businessCategory"],
  planning_business: [],
};

/**
 * Step 03's document questions beyond the three asked. All OFF: switch one on
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
    /** "" until chosen. */
    businessStatus: BusinessStatus | "";
  } & Record<BusinessFieldKey, string>;
  travel: {
    nationality: string;
    hasPassport: boolean | null;
  };
  /** The trip's three consents, in the order the review asks them (lib/trip-legal.ts, TRIP_CONSENTS). */
  consent: {
    privacy: boolean;
    accuracy: boolean;
    terms: boolean;
  };
}

/** The business answers with everything the chosen option does not ask
 *  blanked: what is checked, reviewed, sent and stored. */
export function relevantBusiness(b: TripApplicationPayload["business"]): TripApplicationPayload["business"] {
  const keep: readonly BusinessFieldKey[] = isBusinessStatus(b.businessStatus) ? BUSINESS_FIELDS[b.businessStatus] : [];
  const out = { ...b };
  for (const k of BUSINESS_FIELD_KEYS) if (!keep.includes(k)) out[k] = "";
  return out;
}

/** Field lengths, shared by the inputs' maxLength and the server's check. */
export const LIMITS = {
  name: 100,
  phone: 30,
  country: 100,
  city: 100,
  company: 200,
  role: 120,
  category: 120,
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

export type StepKey = "personal" | "business" | "travel" | "consent";
export type FieldErrors = Partial<Record<string, string>>;

const need = (v: string, min = 1) => v.trim().length >= min;

/**
 * The rules, one step at a time. Messages are the words the form shows under
 * each field, so they are written for the applicant. `phoneOk` is passed in
 * because the mobile check lives in lib/phone (libphonenumber) and depends on
 * the dial code the applicant chose.
 *
 * Step 02 checks only what the chosen option asks (BUSINESS_FIELDS): a hidden
 * question is never required.
 */
export function validateStep(step: StepKey, a: TripApplicationPayload, phoneOk?: boolean): FieldErrors {
  const e: FieldErrors = {};
  if (step === "personal") {
    const p = a.personal;
    if (!need(p.fullName, 2)) e.fullName = "Please enter your full name.";
    if (!need(p.phone)) e.phone = "Please enter your mobile number.";
    else if (phoneOk === false) e.phone = "That isn't a valid mobile number for the code you chose.";
    if (!need(p.country)) e.country = "Please choose your country.";
    if (!need(p.city)) e.city = "Please enter your city.";
  } else if (step === "business") {
    const b = a.business;
    if (!isBusinessStatus(b.businessStatus)) {
      e.businessStatus = "Please choose the one that describes you best.";
    } else if (b.businessStatus === "existing_business") {
      if (!need(b.companyName)) e.companyName = "Please enter your company's name.";
      if (!need(b.role)) e.role = "Please tell us your role.";
      if (!need(b.businessCategory)) e.businessCategory = "Please choose a category.";
    }
    // Planning to start a business: nothing more is asked.
  } else if (step === "travel") {
    const t = a.travel;
    if (!need(t.nationality)) e.nationality = "Please choose your nationality.";
    if (t.hasPassport === null) e.hasPassport = "Please choose one.";
  } else {
    const c = a.consent;
    if (!c.privacy) e.privacy = "Please consent to the Privacy Policy.";
    if (!c.accuracy) e.accuracy = "Please confirm the information is accurate and complete.";
    if (!c.terms) e.terms = "Please agree to the Terms & Conditions.";
  }
  return e;
}

/** Every step at once: the server's check, and the review step's. */
export function validateAll(a: TripApplicationPayload, phoneOk?: boolean): FieldErrors {
  return (["personal", "business", "travel", "consent"] as const).reduce<FieldErrors>(
    (acc, s) => ({ ...acc, ...validateStep(s, a, phoneOk) }),
    {},
  );
}
