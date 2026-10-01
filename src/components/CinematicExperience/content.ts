import { TRIP_FACTS } from "@/lib/trip-legal";

/**
 * Every word the /free-china-trip/ film puts on screen, in one place, so copy
 * can change without touching any animation code (animations.ts only ever
 * looks elements up by data-cx key).
 *
 * THE RULE FOR THIS FILE: the terms of the offer are the trip's own Terms &
 * Conditions (lib/trip-legal.ts, the owner's text of 2026-10-01). Nothing
 * here may state a date, a number, an inclusion, a rule or an outcome that
 * the Terms do not. The Terms themselves are not on this page, on the
 * owner's request: every "Apply for the Trip" shows them, whole, in the
 * consent popup, and they have their own pages. Anything the page needs that
 * nobody has confirmed is flagged `placeholder: true`, which renders a
 * visible "Placeholder" tag beside it; README.md lists every one.
 *
 * Confirmed by the brief: the trip is free, it is a business trip to China,
 * and the three steps (apply, get selected, travel). Confirmed by the Terms:
 * applications open on 5 October and close on 25 November 2026; five winners,
 * drawn at random from the eligible applications, are announced on
 * 1 December 2026 (clauses 1, 3 and 4); the flight is economy class (7),
 * transport is by group (8), rooms are group or shared (9), and a business
 * guide goes with the group (12); the travel date is announced to the
 * winners (1).
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
/**
 * The four inclusions: the brief's first three names, each detail in the
 * Terms' terms (clauses 7, 9 and 8), and the fourth, business guidance
 * (clause 12), which the brief left open as "the China trip experience".
 * Nothing else.
 */
export const INCLUDED: ReadonlyArray<{ title: string; detail: string } & Placeholderable> = [
  { title: "Round-Trip Flight", detail: "Economy class, to China and home again." },
  { title: "Hotel Stay", detail: "Group or shared rooms while you are in China." },
  { title: "Local Transport", detail: "Group transport on the official itinerary." },
  { title: "Business Guidance", detail: "A business guide for the group on the official itinerary." },
];
export const INCLUDED_EYEBROW = "What's included";

// ---- 12 How it works ------------------------------------------------------------------------
export const STEPS_HEADING = { eyebrow: "How it works", title: "Three steps to China." } as const;
export const STEPS: ReadonlyArray<{ title: string; detail: string } & Placeholderable> = [
  { title: "Apply", detail: `Apply between ${dayMonth(TRIP_FACTS.applicationsOpen)} and ${TRIP_FACTS.applicationsClose}. It takes a few minutes.` },
  {
    title: "Get Selected",
    detail: `Five winners are drawn at random from the eligible applications, and announced on ${TRIP_FACTS.winnersAnnounced}.`,
  },
  { title: "Travel to China", detail: "Fly out with the group. The travel date and itinerary are announced to the winners." },
];

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
 * The page ends on the time left until the winners are announced, on
 * 1 December 2026 (the Terms, clause 4), from midnight in India (IST,
 * UTC+05:30), counting live.
 */
export const COUNTDOWN = {
  /** The moment the clock reaches zero, with its time zone. */
  target: "2026-12-01T00:00:00+05:30",
  eyebrow: "Winners announced",
  title: TRIP_FACTS.winnersAnnounced,
  /** Beside the live date and time in India, under the clock. */
  now: "Now in India",
  units: ["Days", "Hours", "Minutes", "Seconds"],
  /** Read by screen readers (updated each minute, never announced). */
  spoken: `Time left until the winners are announced on ${TRIP_FACTS.winnersAnnounced}:`,
  button: "Apply for the Trip",
} as const;

/** Visible tag text for any placeholder entry. */
export const PLACEHOLDER_TAG = "Placeholder";

/** "5 October 2026" → "5 October". */
function dayMonth(date: string) {
  return date.split(" ").slice(0, 2).join(" ");
}
