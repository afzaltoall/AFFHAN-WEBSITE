/**
 * Every rate limit on the site, and what each does when Upstash cannot answer
 * (the owner's policy, 2026-10-09). lib/rate-limit.ts enforces this table; it
 * is kept free of path aliases and other modules so the policy can be tested
 * on its own (tests/security/limit-policy.test.mjs).
 *
 * "When Upstash is down" covers both cases the same way: the variables are
 * missing, or Upstash did not answer in time.
 *
 * - closed: refused with 503 ("... is unavailable right now"). The console's
 *   and the staff sign-in, where a guess is worth the most, and photo search,
 *   where every request is a paid model call.
 * - open: let through with a warning in the log. Customers' sign-in, password
 *   reset, the contact form, quote requests, trip applications and saving a
 *   contact number, where a refused request is a customer lost and something
 *   else still holds: the database lockout and per-address caps, Turnstile
 *   where there is one, and a session for anything that needs one.
 *
 * Under `next dev` everything is let through: working on the site needs no
 * Redis (lib/protections.ts).
 */

export type WhenDown = "open" | "closed";

export interface LimitSpec {
  /** What the limit is counted by: "account or IP" counts a signed-in visitor's account, anyone else's connection. */
  per: "IP" | "account" | "account or IP" | "IP and video";
  count: number;
  /** In @upstash/ratelimit's notation: "15 m", "1 h". */
  window: `${number} ${"s" | "m" | "h" | "d"}`;
  whenDown: WhenDown;
  /** The feature, in the words of a 503: "Sign-in is unavailable right now." */
  feature: string;
}

// The counts are for real users first (the owner, 2026-10-14: "generous limits for real users"). A connection is
// often many people, an office or a mobile network behind one address, so the per-connection limits are well
// above what one person does; what stops a guesser is what counts per account or per address (the database
// lockout, the per-address code caps), which no shared connection dilutes.
export const LIMITS = {
  /** /api/auth/login: a handful of people. The database lockout holds per account. */
  consoleLogin: { per: "IP", count: 10, window: "15 m", whenDown: "closed", feature: "Sign-in" },
  /** /api/employee/auth/login: the office shares one connection. */
  staffLogin: { per: "IP", count: 10, window: "15 m", whenDown: "closed", feature: "Sign-in" },
  /** /api/web/auth/login-password and /api/mobile/auth/login, one count for both. */
  customerLogin: { per: "IP", count: 20, window: "15 m", whenDown: "open", feature: "Sign-in" },
  /** The three steps of both resets, customer and staff: send, verify, set. Per address, lib/email-otp.ts. */
  passwordReset: { per: "IP", count: 10, window: "15 m", whenDown: "open", feature: "Password reset" },
  /** /api/contact. Per sender, the route's own cap in the database. */
  contact: { per: "IP", count: 10, window: "1 h", whenDown: "open", feature: "The contact form" },
  /** /api/inquiry (website) and /api/mobile/inquiries (app), one count per account. */
  inquiry: { per: "account", count: 30, window: "1 h", whenDown: "open", feature: "Quote requests" },
  /** /api/web/account/phone and /api/mobile/account/phone: saving the account's contact number (lib/contact-phone.ts). */
  contactPhone: { per: "account", count: 10, window: "1 h", whenDown: "open", feature: "Saving a number" },
  /** /api/mobile/account/profile: the app saving the account's name, company and address (lib/account-profile.ts). */
  profile: { per: "account", count: 30, window: "1 h", whenDown: "open", feature: "Saving your details" },
  /** /api/trip-applications (website and app). One application per account, email and number regardless. */
  tripApplication: { per: "IP", count: 10, window: "1 h", whenDown: "open", feature: "Trip applications" },
  /** /api/search/image (website and app): each signed-in account, or each connection when signed out. */
  photoSearch: { per: "account or IP", count: 40, window: "1 h", whenDown: "closed", feature: "Photo search" },
  /** /api/search/image as well: a ceiling per connection, for many accounts behind one address. */
  photoSearchPerIp: { per: "IP", count: 200, window: "1 h", whenDown: "closed", feature: "Photo search" },
  /** /api/videos/[id]: counts a view once an hour; never refuses anything. */
  videoView: { per: "IP and video", count: 1, window: "1 h", whenDown: "open", feature: "Video views" },
} as const satisfies Record<string, LimitSpec>;

export type LimitName = keyof typeof LIMITS;

/** What a limit does when Upstash is missing or did not answer. */
export function whenUpstashDown(whenDown: WhenDown, production: boolean): "allow" | "refuse" {
  return production && whenDown === "closed" ? "refuse" : "allow";
}
