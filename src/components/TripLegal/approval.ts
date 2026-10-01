/**
 * Whether the applicant has agreed, in the consent popup, to the trip's Terms
 * & Conditions and Privacy Policy: in memory only, like the application's own
 * consent ticks (useApplication.ts keeps consent out of browser storage on
 * purpose).
 *
 * A module-level value survives the client-side navigation from the landing
 * page to /free-china-trip/apply/, so agreeing there opens the application
 * without asking again, and the review's Privacy Policy and Terms boxes arrive
 * ticked. The landing page's "Apply for the Trip" asks every time all the
 * same. A reload starts again: an agreement is never carried anywhere it
 * could be read later.
 */

let agreedAt: number | null = null;

export function agreeToTripTerms() {
  agreedAt = Date.now();
}

export function hasAgreedToTripTerms() {
  return agreedAt !== null;
}
