/**
 * Whether the applicant has agreed, in the consent popup, to the trip's Terms
 * & Conditions and Privacy Policy: in memory only, like the application's own
 * consent ticks (useApplication.ts keeps consent out of browser storage on
 * purpose).
 *
 * A module-level value survives the client-side navigation from the landing
 * page to /free-china-trip/apply/, so agreeing there opens the application
 * already agreed. A reload starts again, and the popup asks again: an
 * agreement is never carried anywhere it could be read later.
 */

let agreedAt: number | null = null;

export function agreeToTripTerms() {
  agreedAt = Date.now();
}

export function hasAgreedToTripTerms() {
  return agreedAt !== null;
}

/** Unticking either box in the application takes the agreement back too. */
export function withdrawTripAgreement() {
  agreedAt = null;
}
