/**
 * Every word the /free-china-trip/ film puts on screen, in one place, so the
 * placeholder copy can be swapped for approved copy without touching any
 * animation code (animations.ts only ever looks elements up by data-cx key).
 *
 * THE RULE FOR THIS FILE: nothing here may state a date, a fee, a prize value,
 * a number of places, an eligibility rule, a visa outcome or any other term of
 * the offer, because none has been confirmed. Where the page needs such a thing
 * it says so, and the entry is flagged `placeholder: true`, which renders a
 * visible "Placeholder" tag beside it. README.md lists every one.
 *
 * Confirmed by the brief, and therefore stated plainly: the trip is free, it is
 * a business trip to China, and it includes a round-trip flight, a hotel stay,
 * local transport and the China trip experience. The three steps (apply, get
 * selected, travel) are the brief's too.
 */

export interface Placeholderable {
  /** Renders a visible "Placeholder" tag; see README.md before launch. */
  placeholder?: boolean;
}

// ---- 00 The opening count (NumberLoadingOpener) --------------------------------
export const COUNTER = {
  /** A whisper under the numerals: what the count is counting down to. */
  caption: "Free China Business Trip",
} as const;

// ---- 01 Opening --------------------------------------------------------------
export const HERO = {
  eyebrow: "AFFHAN International presents",
  /** Set in capitals by CSS; the sr-only tail gives search and screen readers the destination. */
  titleLines: ["Free", "Business", "Trip"],
  titleSrTail: " to China",
  /**
   * Under FREE, the headline's second and third lines take turns through
   * what the offer covers, in the words of `line` below and nothing more
   * (HeroTurns.tsx). The first pair is the title itself. Decorative: the
   * <h1> always reads titleLines.
   */
  turns: [
    ["Business", "Trip"],
    ["Round-trip", "Flight"],
    ["Hotel", "Stay"],
    ["Local", "Transport"],
  ],
  line: "Your round-trip flight, hotel stay and local transport in China, covered.",
  cta: "Apply for the Trip",
  scrollHint: "Scroll to begin the journey",
} as const;

// ---- Chapter marks (the small "03 / 11 Boarding" readout) -----------------------
/** One per film chapter, in order. The readout is a real sequence, so it is numbered. */
export const CHAPTERS = [
  "Departure",
  "Passport",
  "Boarding",
  "Flight",
  "The route",
  "China",
  "Guangzhou",
  "Foshan",
  "Hotel",
  "Free",
  "What's included",
] as const;

// ---- 02–09 Film captions ------------------------------------------------------------
export const CAPTIONS = {
  passport: { eyebrow: "Passport", title: "The journey starts here." },
  boarding: { eyebrow: "Boarding", title: "India to China." },
  plane: { eyebrow: "Flight", title: "Wheels up." },
  globe: { eyebrow: "The route", title: "One line across the map.", from: "India", to: "China" },
  map: { eyebrow: "Destination", title: "China", hanzi: "中国" },
  foshan: { eyebrow: "Arrival", title: "You've arrived." },
  hotel: { eyebrow: "Your stay", title: "Check in. Rest well." },
} as const;

/**
 * The cities: Guangzhou, then Foshan. Names, characters and coordinates are
 * facts about the cities. The page never says the trip visits them: the
 * itinerary is not confirmed (see README.md), so these read as a travel
 * montage, not a schedule. In October, on the owner's request, Shanghai and
 * Beijing came out, so Guangzhou is the first, and Foshan (its furniture
 * market) took Yiwu's place as the arrival. Foshan's are the city's own
 * coordinates.
 */
export const CITIES = [
  { key: "guangzhou", name: "Guangzhou", hanzi: "广州", coords: "23.13° N · 113.26° E" },
  { key: "foshan", name: "Foshan", hanzi: "佛山", coords: "23.02° N · 113.12° E" },
] as const;

// ---- 10 FREE reveal -----------------------------------------------------------------------
export const FREE = {
  word: "Free",
  sub: "China Business Trip",
} as const;

// ---- 11 What's included --------------------------------------------------------------------
/** The four confirmed inclusions, in the brief's order and words. Nothing else. */
export const INCLUDED: ReadonlyArray<{ title: string; detail: string } & Placeholderable> = [
  { title: "Round-Trip Flight", detail: "Your flight to China, and home again." },
  { title: "Hotel Stay", detail: "Your accommodation while you are in China." },
  { title: "Local Transport", detail: "Getting around in China during the trip." },
  {
    title: "China Trip Experience",
    detail: "What the experience includes will be published here.",
    placeholder: true,
  },
];
export const INCLUDED_EYEBROW = "What's included";

// ---- 12 How it works ------------------------------------------------------------------------
export const STEPS_HEADING = { eyebrow: "How it works", title: "Three steps to China." } as const;
export const STEPS: ReadonlyArray<{ title: string; detail: string } & Placeholderable> = [
  { title: "Apply", detail: "Complete the four-step application on this page. It takes a few minutes." },
  {
    title: "Get Selected",
    detail: "How applications are reviewed, and when applicants hear back, will be published here.",
    placeholder: true,
  },
  { title: "Travel to China", detail: "Fly out with your flight, hotel stay and local transport covered." },
];

// ---- 13 Terms & Conditions ----------------------------------------------------------------------
/**
 * Every section is a placeholder. Do not fill these in from assumption: they
 * are the legal terms of the offer and must come from Affhan.
 */
export const TERMS = {
  eyebrow: "The fine print",
  title: "Terms & Conditions",
  notice:
    "The official terms for this trip are being finalised. Each section below is a placeholder and is not binding: nothing on this page sets dates, fees, eligibility, selection criteria or guarantees.",
  sections: [
    { id: "eligibility", title: "Eligibility", body: "Who can apply will be set out here." },
    { id: "requirements", title: "Application Requirements", body: "What a complete application must include will be set out here." },
    { id: "selection", title: "Selection Process", body: "How applications are reviewed and how applicants are selected will be set out here." },
    {
      id: "travel",
      title: "Travel & Visa Responsibilities",
      body: "Who is responsible for visas, travel insurance and other travel requirements will be set out here.",
    },
    { id: "documents", title: "Required Documents", body: "The documents you will need, and when, will be set out here." },
    { id: "changes", title: "Cancellation & Changes", body: "What happens if plans change, on either side, will be set out here." },
    { id: "other", title: "Other Applicable Conditions", body: "Any further conditions of the offer will be set out here." },
  ],
} as const;

// ---- 14 Final CTA ---------------------------------------------------------------------------------
/**
 * The host is deliberately unnamed and uncaptioned: no name or title has been
 * supplied, and inventing one would be a fabricated identity. If Affhan
 * supplies one, add it here and render it in Scene14FinalCta.
 */
export const FINAL_CTA = {
  headline: "Ready to go?",
  line: "Your China business journey starts with one application.",
  button: "Apply for the Trip",
  note: "Takes a few minutes to complete.",
  hostAlt: "A presenter in a burgundy suit, one hand open towards the application",
} as const;

/** Where every "Apply for the Trip" goes: the application, its own page. */
export const APPLY_HREF = "/free-china-trip/apply/";

// ---- 16 The countdown --------------------------------------------------------------------------------
/**
 * The page ends on the time left until 1 December 2026, midnight in India
 * (IST, UTC+05:30), counting live.
 *
 * PLACEHOLDER: what happens on that date (applications close? the trip
 * departs?) has not been confirmed, so the words give the date and nothing
 * more. When it is, say it in the eyebrow (e.g. "Applications close in").
 */
export const COUNTDOWN = {
  /** The moment the clock reaches zero, with its time zone. */
  target: "2026-12-01T00:00:00+05:30",
  eyebrow: "Counting down to",
  title: "1 December 2026",
  /** Beside the live date and time in India, under the clock. */
  now: "Now in India",
  units: ["Days", "Hours", "Minutes", "Seconds"],
  /** Read by screen readers (updated each minute, never announced). */
  spoken: "Time left until 1 December 2026:",
  button: "Apply for the Trip",
} as const;

/** Visible tag text for any placeholder entry. */
export const PLACEHOLDER_TAG = "Placeholder";
