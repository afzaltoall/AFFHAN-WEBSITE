import { TRIP_FACTS } from "@/lib/trip-legal";

/**
 * Every word on /free-china-trip/apply/, in one place, so copy can change
 * without touching a component. The dates are the Terms' own (TRIP_FACTS);
 * nothing here promises selection, visas, hotels, flights or outcomes, and
 * nothing asks the applicant to run a business. See README.md.
 */

/** The page's one h1 (visually hidden: each chapter shows its own heading). */
export const PAGE_TITLE = "Apply for the Free China Business Trip";

/** Without JavaScript the application can't run; say so, and offer a way. */
export const NO_SCRIPT = {
  line: "This application needs JavaScript switched on in your browser.",
  contact: { href: "/contact/", label: "Contact AFFHAN instead" },
} as const;

export const INTRO = {
  eyebrow: "AFFHAN International presents",
  heading: ["Your journey", "starts here"],
  line: "Apply for the Free China Business Trip.",
  body: "Tell us a little about yourself and your business so we can review your application and understand your travel profile.",
  cta: "Start application",
  time: "Estimated time: a few minutes.",
  characterAlt: "A presenter in a burgundy suit, one hand open towards the application",
  /** In place of Start outside the application window (Terms, clause 1). */
  before: `Applications open on ${TRIP_FACTS.applicationsOpen}.`,
  closed: `Applications closed on ${TRIP_FACTS.applicationsClose}.`,
  closedNext: `The five winners will be announced on ${TRIP_FACTS.winnersAnnounced}.`,
} as const;

export const STEPS = [
  { key: "personal", number: "01", title: "About you", lede: "The basics, so our team knows who to contact." },
  { key: "business", number: "02", title: "Your business journey", lede: "Tell us where you are in your business journey." },
  { key: "profile", number: "03", title: "Business profile", lede: "What you would like to explore in China." },
  { key: "travel", number: "04", title: "Travel profile", lede: "Three quick questions about travelling." },
  { key: "review", number: "05", title: "Review & submit", lede: "Check your answers, then send your application." },
] as const;

export const NAV = {
  back: "Back",
  next: "Next",
  toReview: "Save & return to review",
  submit: "Submit application",
} as const;

export const LABELS = {
  fullName: "Full name",
  email: "Email",
  phone: "Mobile number",
  country: "Country",
  city: "City",
  profileUrl: "Website or LinkedIn",
  // 02: the first question, then each option's own (lib/trip-application.ts, BUSINESS_FIELDS).
  businessStatus: "What best describes you?",
  companyName: "Company name",
  brandName: "Business / brand name",
  role: "Your role",
  businessCategory: "Business category",
  businessArea: "Business category / area",
  companyWebsite: "Company website",
  yearsInBusiness: "Years in business",
  businessDescription: "About your business",
  businessPlan: "What are you planning to build?",
  areaOfInterest: "Area of interest",
  exploreGoal: "What would you like to explore in China?",
  /** Step 01's website or LinkedIn, asked again for someone without a business. */
  websiteOrLinkedIn: "Website / LinkedIn",
  interests: "What are you interested in?",
  productsOfInterest: "Products or categories of interest",
  exploreNotes: "What are you hoping to explore in China?",
  nationality: "Nationality",
  hasPassport: "Do you have a valid passport?",
  travelledToChina: "Have you travelled to China before?",
} as const;

export const PLACEHOLDERS = {
  fullName: "Your full name",
  email: "you@company.com",
  phone: "9876543210",
  city: "e.g. Chennai",
  profileUrl: "yourcompany.com or linkedin.com/in/…",
  companyName: "Company name",
  brandName: "If you have one already",
  role: "e.g. Founder, Purchasing manager",
  businessCategory: "Search categories",
  companyWebsite: "yourcompany.com",
  businessDescription: "What you sell or make, who you sell to, and where.",
  businessPlan: "What you plan to make or sell, and who for.",
  exploreGoal: "The kind of business or opportunities you would like to find.",
  productsOfInterest: "e.g. LED lighting, cotton t-shirts, packaging boxes",
  exploreNotes: "Factories, markets, suppliers, anything you would like to see.",
} as const;

/** Lines that sit under a question, always shown. */
export const NOTES = {
  passport: "Passport and visa documents may be requested from selected applicants during verification and travel processing.",
} as const;

export const REVIEW = {
  groups: { personal: "About you", business: "Your business journey", profile: "Business profile", travel: "Travel profile" },
  edit: "Edit",
  notGiven: "Not given",
  /** Short forms for the review's lines (the questions are long). */
  brief: { passport: "Valid passport", travelled: "Travelled to China", inBusiness: "in business", area: "Area of interest" },
  // The three consents are the trip's own words: TRIP_CONSENTS in lib/trip-legal.ts.
} as const;

export const SUBMIT = {
  holding: "Recording your application",
  /** Beside Submit while it cannot be pressed (StepNav): the box, or boxes, still to tick. */
  needsConsent: (missing: readonly ("privacy" | "accuracy" | "terms")[]) =>
    missing.length > 1
      ? "Tick the boxes above to submit your application."
      : missing[0] === "accuracy"
        ? "Confirm that your information is accurate and complete to submit."
        : missing[0] === "privacy"
          ? "Consent to the Privacy Policy above to submit."
          : "Agree to the Terms & Conditions above to submit.",
  needsAnswers: (steps: string) => `Some answers need another look before you can submit: ${steps}.`,
} as const;

export const SUCCESS = {
  eyebrow: "AFFHAN International",
  title: "Application received",
  line: "Thank you for applying to the Free China Business Trip.",
  next: "Your application has been recorded. We'll be in touch with the next steps.",
  reference: "Your reference",
  home: { href: "/", label: "Back to AFFHAN" },
  trip: { href: "/free-china-trip/", label: "View trip details" },
} as const;

export const FAILURE = {
  title: "We couldn't complete your application",
  line: "Please check your connection and try again.",
  /** When the server says too many applications came from this connection. */
  limited: "Too many applications from this connection. Please try again later.",
  /** The window closed (or had not opened) on the server's clock: the server says which. */
  closed: `Applications closed on ${TRIP_FACTS.applicationsClose}.`,
  /** One application per person: the server found one from this email or mobile. */
  duplicate: "We have already received an application from this email address or mobile number. To change anything in it, write to info@affhan.com.",
  retry: "Try again",
  review: "Review your answers",
  kept: "Everything you entered is still here.",
} as const;
