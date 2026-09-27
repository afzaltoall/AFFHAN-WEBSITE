/**
 * Every word on /free-china-trip/apply/, in one place, so copy can change
 * without touching a component. Nothing here states eligibility, selection,
 * dates, visas, hotels, flights or outcomes: none is confirmed. See README.md.
 */

/** The page's one h1 (visually hidden: each chapter shows its own heading). */
export const PAGE_TITLE = "Apply for the Free China Business Trip";

/** Without JavaScript the application can't run; say so, and offer a way. */
export const NO_SCRIPT = {
  line: "This application needs JavaScript switched on in your browser.",
  contact: { href: "/contact/", label: "Contact Affhan instead" },
} as const;

export const INTRO = {
  eyebrow: "Affhan International presents",
  heading: ["Your journey", "starts here"],
  line: "Apply for the Free China Business Trip.",
  body: "Tell us a little about yourself and your business so we can review your application and understand your travel profile.",
  cta: "Start application",
  time: "Estimated time: a few minutes.",
  characterAlt: "A presenter in a burgundy suit, one hand open towards the application",
} as const;

export const STEPS = [
  { key: "personal", number: "01", title: "About you", lede: "The basics, so our team knows who to call." },
  { key: "business", number: "02", title: "Your business", lede: "What your company does, in your words." },
  { key: "profile", number: "03", title: "Business profile", lede: "What you would like to find in China." },
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
  companyName: "Company name",
  role: "Your role",
  businessCategory: "Business category",
  companyWebsite: "Company website",
  yearsInBusiness: "Years in business",
  businessDescription: "About your business",
  interests: "What are you interested in?",
  productsOfInterest: "Products or categories of interest",
  exploreNotes: "What are you hoping to explore in China?",
  nationality: "Nationality",
  hasPassport: "Do you have a passport?",
  travelledToChina: "Have you travelled to China before?",
} as const;

export const PLACEHOLDERS = {
  fullName: "Your full name",
  email: "you@company.com",
  phone: "9876543210",
  city: "e.g. Chennai",
  profileUrl: "yourcompany.com or linkedin.com/in/…",
  companyName: "Company name",
  role: "e.g. Founder, Purchasing manager",
  businessCategory: "Search categories",
  companyWebsite: "yourcompany.com",
  businessDescription: "What you sell or make, who you sell to, and where.",
  productsOfInterest: "e.g. LED lighting, cotton t-shirts, packaging boxes",
  exploreNotes: "Factories, markets, suppliers, anything you would like to see.",
} as const;

export const REVIEW = {
  groups: { personal: "About you", business: "Your business", profile: "Business profile", travel: "Travel profile" },
  edit: "Edit",
  accuracy: "I confirm the information provided is accurate.",
  termsBefore: "I agree to the",
  terms: { href: "/terms-conditions/", label: "Terms & Conditions" },
  and: "and",
  privacy: { href: "/privacy-policy/", label: "Privacy Policy" },
} as const;

export const SUBMIT = {
  holding: "Recording your application",
} as const;

export const SUCCESS = {
  eyebrow: "Affhan International",
  title: "Application received",
  line: "Thank you for applying to the Free China Business Trip.",
  next: "Your application has been recorded. We'll be in touch with the next steps.",
  reference: "Your reference",
  home: { href: "/", label: "Back to Affhan" },
  trip: { href: "/free-china-trip/", label: "View trip details" },
} as const;

export const FAILURE = {
  title: "We couldn't complete your application",
  line: "Please check your connection and try again.",
  /** When the server says too many applications came from this connection. */
  limited: "Too many applications from this connection. Please try again later.",
  retry: "Try again",
  review: "Review your answers",
  kept: "Everything you entered is still here.",
} as const;
