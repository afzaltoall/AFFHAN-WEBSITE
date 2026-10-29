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

/**
 * One page since 2026-10-29 (the owner: "nama china page single page ... indha contents"): six questions and Submit,
 * no steps and no review. Kept as a list of one so the page's heading reads from it as it always has.
 */
export const STEPS = [
  { key: "application", number: "01", title: "Apply for the trip", lede: "A few quick details, so our team knows who to contact." },
] as const;

export const NAV = {
  submit: "Submit application",
} as const;

/** The owner's six, in their order (2026-10-29): name, mobile, country, city, doing business or not, valid passport. */
export const LABELS = {
  fullName: "Full name",
  phone: "Mobile number",
  country: "Country",
  city: "City",
  runsBusiness: "Do you run a business?",
  hasPassport: "Do you have a valid passport?",
} as const;

export const PLACEHOLDERS = {
  fullName: "Your full name",
  phone: "9876543210",
  city: "e.g. Chennai",
} as const;


export const SUBMIT = {
  /** Under the AFFHAN emblem while the application is sent and recorded. */
  processing: "Processing your application",
  /** Cloudflare's check, for someone not signed in, is still running (out of sight). */
  checking: "One moment: a quick security check is finishing.",
  /** Cloudflare wants the visitor to do something: its box is under the buttons. */
  checkShowing: "Complete the security check below to submit.",
  /** Cloudflare's check could not run (blocked, or offline). It keeps trying by itself. */
  checkFailed: "The security check couldn't load. Check your connection, or reload the page.",
} as const;

/** The moment after the server confirms: then on to their boarding pass. */
export const SUCCESS = {
  eyebrow: "AFFHAN International",
  title: "Application submitted",
  line: (firstName: string) => (firstName ? `Welcome aboard, ${firstName}.` : "Welcome aboard."),
  reference: "Your Trip ID",
  /** Before the moment the database recorded it (India time). */
  recorded: "Recorded at",
  next: "Taking you to your boarding pass",
  go: "See your boarding pass",
} as const;

export const FAILURE = {
  title: "We couldn't complete your application",
  /** The request never arrived. */
  line: "Please check your connection and try again.",
  /** It arrived, and the server could not record it. */
  server: "We couldn't record your application just now. Please try again in a moment.",
  /** Cloudflare's check did not pass (someone not signed in). */
  human: "The security check didn't go through. Please try again.",
  /** When the server says too many applications came from this connection. */
  limited: "Too many applications from this connection. Please try again later.",
  /** The window closed (or had not opened) on the server's clock: the server says which. */
  closed: `Applications closed on ${TRIP_FACTS.applicationsClose}.`,
  /** One application per person: the server found one from this account or mobile. */
  duplicate: "We have already received an application from this account or mobile number. To change anything in it, write to info@affhan.com.",
  retry: "Try again",
  review: "Back to your answers",
  kept: "Everything you entered is still here.",
} as const;
