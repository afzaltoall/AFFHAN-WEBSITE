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
 * document uploads. The trip's process has not confirmed it needs them; see
 * TRAVEL_DOCUMENTS below and the TripApplication model.
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
    companyName: string;
    role: string;
    businessCategory: string;
    companyWebsite: string;
    yearsInBusiness: string;
    businessDescription: string;
  };
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
  consent: {
    accuracy: boolean;
    terms: boolean;
  };
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** A web address or a LinkedIn handle-URL: something with a dot and no spaces. */
const URLISH_RE = /^(https?:\/\/)?[^\s/$.?#][^\s]*\.[^\s]{2,}$/i;

export type StepKey = "personal" | "business" | "profile" | "travel" | "consent";
export type FieldErrors = Partial<Record<string, string>>;

const need = (v: string, min = 1) => v.trim().length >= min;

/**
 * The rules, one step at a time. Messages are the words the form shows under
 * each field, so they are written for the applicant. `phoneOk` is passed in
 * because the mobile check lives in lib/phone (libphonenumber) and depends on
 * the dial code the applicant chose.
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
    if (p.profileUrl.trim() && !URLISH_RE.test(p.profileUrl.trim())) e.profileUrl = "That doesn't look like a web address.";
  } else if (step === "business") {
    const b = a.business;
    if (!need(b.companyName)) e.companyName = "Please enter your company's name.";
    if (!need(b.role)) e.role = "Please tell us your role.";
    if (!need(b.businessCategory)) e.businessCategory = "Please choose a category.";
    if (b.companyWebsite.trim() && !URLISH_RE.test(b.companyWebsite.trim())) e.companyWebsite = "That doesn't look like a web address.";
    if (!need(b.yearsInBusiness)) e.yearsInBusiness = "Please choose one.";
    if (!need(b.businessDescription, 10)) e.businessDescription = "Please describe your business in a sentence or two.";
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
    if (!c.accuracy) e.accuracy = "Please confirm the information is accurate.";
    if (!c.terms) e.terms = "Please agree to the Terms & Conditions and Privacy Policy.";
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
