/**
 * The free China business trip application: its shape, its option lists and
 * its rules, in one place that both the form (components/TripApplication) and
 * the API (/api/trip-applications) read, so the browser and the server can
 * never disagree about what a valid application is.
 *
 * PLACEHOLDER LISTS. BUSINESS_CATEGORIES and INTERESTS are working lists, not
 * approved ones; swap them here and nothing else changes (see
 * components/TripApplication/README.md).
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

export const YEARS_IN_BUSINESS = ["Under 1 year", "1–3 years", "3–5 years", "5–10 years", "10+ years"] as const;

/** Step 03's "What are you interested in?" (placeholder list). */
export const INTERESTS = [
  "Sourcing",
  "Suppliers",
  "Manufacturing",
  "New Products",
  "Packaging",
  "Market Exploration",
  "Other",
] as const;

/**
 * Step 02's first question, "What best describes you?": where the applicant
 * is in their business journey. Anyone may apply, with a business or without
 * one; the answer only decides which questions step 02 asks next
 * (BUSINESS_FIELDS). `label` is the option as the form offers it, `brief` the
 * same in a few words (the review, the team's console).
 */
export const BUSINESS_STATUSES = [
  { value: "existing_business", label: "I currently run a business", brief: "Runs a business" },
  { value: "planning_business", label: "I am planning to start a business", brief: "Planning to start a business" },
  { value: "expanding_business", label: "I am looking to expand an existing business", brief: "Expanding an existing business" },
  { value: "no_business_yet", label: "I don't have a business yet — I'm exploring opportunities", brief: "Exploring opportunities" },
] as const;

export type BusinessStatus = (typeof BUSINESS_STATUSES)[number]["value"];

export function isBusinessStatus(v: unknown): v is BusinessStatus {
  return BUSINESS_STATUSES.some((s) => s.value === v);
}

/** The few words for a status ("Runs a business"), or "" for none. */
export function businessStatusBrief(v: unknown): string {
  return BUSINESS_STATUSES.find((s) => s.value === v)?.brief ?? "";
}

/** Step 02's answers after the first question. */
export const BUSINESS_FIELD_KEYS = [
  "companyName",
  "role",
  "businessCategory",
  "companyWebsite",
  "yearsInBusiness",
  "businessDescription",
  "businessPlan",
  "areaOfInterest",
  "exploreGoal",
] as const;
export type BusinessFieldKey = (typeof BUSINESS_FIELD_KEYS)[number];

/**
 * The answers each option asks for, in the order step 02 shows them. Every
 * other business answer stays blank for that option: it is not shown, not
 * checked, not reviewed and not sent. The same key keeps its meaning across
 * options that share it (a company or brand name, a category, a website), so
 * changing option keeps those and clears only the rest.
 *
 *   existing / expanding: company name, role, category, website (optional),
 *                         years in business, about the business
 *   planning:             business / brand name (optional), category / area,
 *                         what they plan to build, website (optional)
 *   no business yet:      area of interest, what they would like to explore
 *                         in China; and their website or LinkedIn, which is
 *                         step 01's own answer (personal.profileUrl), asked
 *                         again here and never stored twice
 */
export const BUSINESS_FIELDS: Record<BusinessStatus, readonly BusinessFieldKey[]> = {
  existing_business: ["companyName", "role", "businessCategory", "companyWebsite", "yearsInBusiness", "businessDescription"],
  planning_business: ["companyName", "businessCategory", "businessPlan", "companyWebsite"],
  expanding_business: ["companyName", "role", "businessCategory", "companyWebsite", "yearsInBusiness", "businessDescription"],
  no_business_yet: ["areaOfInterest", "exploreGoal"],
};

/**
 * Step 04's document questions beyond the three asked. All OFF: switch one on
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
    email: string;
    /** With its dial code: "+91 9876543210". */
    phone: string;
    country: string;
    city: string;
    profileUrl: string;
  };
  business: {
    /** "" until chosen. */
    businessStatus: BusinessStatus | "";
  } & Record<BusinessFieldKey, string>;
  profile: {
    interests: string[];
    productsOfInterest: string;
    exploreNotes: string;
  };
  travel: {
    nationality: string;
    hasPassport: boolean | null;
    travelledToChina: boolean | null;
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
  email: 200,
  phone: 30,
  country: 100,
  city: 100,
  url: 300,
  company: 200,
  role: 120,
  category: 120,
  description: 1500,
  products: 1000,
  explore: 1000,
} as const;

/**
 * When applications are taken (Terms, clause 1): from 5 October 2026 to 25
 * November 2026, in India's time, as the countdown keeps it. The first moment
 * of the 5th, IST, to the last moment of the 25th.
 */
export const APPLICATION_WINDOW = {
  opens: Date.parse("2026-10-05T00:00:00+05:30"),
  /** The first moment after 25 November 2026, IST. */
  closes: Date.parse("2026-11-26T00:00:00+05:30"),
} as const;

export type WindowState = "before" | "open" | "closed";

/**
 * Whether applications are being taken now. Kept by a production build (the
 * live site and its previews), in the browser and again by the API. A
 * development server (next dev, localhost) is always open, so the form can be
 * tried before 5 October.
 */
export function applicationWindow(now = Date.now()): WindowState {
  if (process.env.NODE_ENV !== "production") return "open";
  if (now < APPLICATION_WINDOW.opens) return "before";
  if (now >= APPLICATION_WINDOW.closes) return "closed";
  return "open";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A web address or a LinkedIn handle-URL: something with a dot and no spaces. */
const URLISH_RE = /^(https?:\/\/)?[^\s/$.?#][^\s]*\.[^\s]{2,}$/i;

export type StepKey = "personal" | "business" | "profile" | "travel" | "consent";
export type FieldErrors = Partial<Record<string, string>>;

const need = (v: string, min = 1) => v.trim().length >= min;
const urlBad = (v: string) => !!v.trim() && !URLISH_RE.test(v.trim());

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
    if (!need(p.email)) e.email = "Please enter your email.";
    else if (!EMAIL_RE.test(p.email.trim())) e.email = "That email doesn't look complete.";
    if (!need(p.phone)) e.phone = "Please enter your mobile number.";
    else if (phoneOk === false) e.phone = "That isn't a valid mobile number for the code you chose.";
    if (!need(p.country)) e.country = "Please choose your country.";
    if (!need(p.city)) e.city = "Please enter your city.";
    if (urlBad(p.profileUrl)) e.profileUrl = "That doesn't look like a web address.";
  } else if (step === "business") {
    const b = a.business;
    const s = b.businessStatus;
    if (!isBusinessStatus(s)) {
      e.businessStatus = "Please choose the one that describes you best.";
    } else if (s === "existing_business" || s === "expanding_business") {
      if (!need(b.companyName)) e.companyName = "Please enter your company's name.";
      if (!need(b.role)) e.role = "Please tell us your role.";
      if (!need(b.businessCategory)) e.businessCategory = "Please choose a category.";
      if (urlBad(b.companyWebsite)) e.companyWebsite = "That doesn't look like a web address.";
      if (!need(b.yearsInBusiness)) e.yearsInBusiness = "Please choose one.";
      if (!need(b.businessDescription, 10)) e.businessDescription = "Please describe your business in a sentence or two.";
    } else if (s === "planning_business") {
      if (!need(b.businessCategory)) e.businessCategory = "Please choose a category or area.";
      if (!need(b.businessPlan, 2)) e.businessPlan = "Please tell us what you're planning to build.";
      if (urlBad(b.companyWebsite)) e.companyWebsite = "That doesn't look like a web address.";
    } else {
      if (!need(b.areaOfInterest)) e.areaOfInterest = "Please choose an area of interest.";
      if (!need(b.exploreGoal, 2)) e.exploreGoal = "Please tell us what you would like to explore in China.";
      // Step 01's website or LinkedIn, asked again on this path.
      if (urlBad(a.personal.profileUrl)) e.profileUrl = "That doesn't look like a web address.";
    }
  } else if (step === "profile") {
    const p = a.profile;
    if (!p.interests.length) e.interests = "Please choose at least one.";
    if (!need(p.productsOfInterest, 2)) e.productsOfInterest = "Please tell us the products or categories you're interested in.";
  } else if (step === "travel") {
    const t = a.travel;
    if (!need(t.nationality)) e.nationality = "Please choose your nationality.";
    if (t.hasPassport === null) e.hasPassport = "Please choose one.";
    if (t.travelledToChina === null) e.travelledToChina = "Please choose one.";
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
  return (["personal", "business", "profile", "travel", "consent"] as const).reduce<FieldErrors>(
    (acc, s) => ({ ...acc, ...validateStep(s, a, phoneOk) }),
    {},
  );
}
