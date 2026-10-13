/**
 * The trip's phone cut: a touch screen that is narrow (under 768px) or a phone
 * on its side (under 540px tall). Measured on the owner's moto g45
 * (2026-10-13), the full film kept the main thread ~90% busy and the GPU
 * 240-690ms of every second of a swipe, and the page stuck under the finger;
 * the owner asked for the scroll animation and the stars to go. On a phone:
 *
 *  - no scroll animation: nothing is pinned or scrubbed. The film keeps its
 *    opening frame and its chapters 02-11 are a route of cards
 *    (MobileJourney); How it works flows; the call and the countdown are a
 *    screen each (CinematicExperience.tsx, animations.ts, cinematic.css).
 *  - no stars and no gold dust (Starfield, GoldDust): the ink is the ground.
 *  - no smooth scrolling: Lenis smooths a mouse wheel, which a phone does not
 *    have, and its touch listeners are not passive, so with it the phone waited
 *    for the page's script before every move of a finger (that one goes for
 *    any touch screen: CinematicExperience.tsx).
 *  - no blur on what still moves: the countdown's figures and the opening
 *    count roll in without one (F below), and the application's glass is a
 *    tint (apply.css).
 *  - the hero's words do not turn (HeroTurns).
 *
 * Tablets and computers keep the whole film. The same query is written out in
 * cinematic.css and apply.css: keep them the same. (The Terms sheet has its
 * own phone layout, below 640px, in TripLegal/trip-legal.css.)
 */
export const LITE_QUERY =
  "(hover: none) and (pointer: coarse) and (max-width: 767.98px), (hover: none) and (pointer: coarse) and (max-height: 540px)";

/** True on a phone. Read when something is built, never per frame. */
export function isLite(): boolean {
  return typeof window !== "undefined" && window.matchMedia(LITE_QUERY).matches;
}

/** A filter as it is animated: on a phone, the same without its blur (brightness and saturation stay). */
export function F(filter: string): string {
  if (!isLite()) return filter;
  const kept = filter.replace(/blur\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  return kept || "none";
}
