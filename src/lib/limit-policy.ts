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
 *   reset, the contact form, quote requests and trip applications, where a
 *   refused request is a customer lost and something else still holds: the
 *   database lockout and per-address caps, and Turnstile where there is one.
 *
 * Under `next dev` everything is let through: working on the site needs no
 * Redis (lib/protections.ts).
 */

export type WhenDown = "open" | "closed";

export interface LimitSpec {
  /** What the limit is counted by. */
  per: "IP" | "account" | "IP and video";
  count: number;
  /** In @upstash/ratelimit's notation: "15 m", "1 h". */
  window: `${number} ${"s" | "m" | "h" | "d"}`;
  whenDown: WhenDown;
  /** The feature, in the words of a 503: "Sign-in is unavailable right now." */
  feature: string;
}

export const LIMITS = {
  /** /api/auth/login */
  consoleLogin: { per: "IP", count: 5, window: "15 m", whenDown: "closed", feature: "Sign-in" },
  /** /api/employee/auth/login */
  staffLogin: { per: "IP", count: 5, window: "15 m", whenDown: "closed", feature: "Sign-in" },
  /** /api/web/auth/login-password and /api/mobile/auth/login, one count for both. */
  customerLogin: { per: "IP", count: 5, window: "15 m", whenDown: "open", feature: "Sign-in" },
  /** The three steps of both resets, customer and staff: send, verify, set. */
  passwordReset: { per: "IP", count: 5, window: "15 m", whenDown: "open", feature: "Password reset" },
  /** /api/contact */
  contact: { per: "IP", count: 5, window: "1 h", whenDown: "open", feature: "The contact form" },
  /** /api/inquiry (website) and /api/mobile/inquiries (app), one count per account. */
  inquiry: { per: "account", count: 30, window: "1 h", whenDown: "open", feature: "Quote requests" },
  /** /api/trip-applications (website and app) */
  tripApplication: { per: "IP", count: 5, window: "1 h", whenDown: "open", feature: "Trip applications" },
  /** /api/search/image (website and app) */
  photoSearch: { per: "IP", count: 30, window: "1 h", whenDown: "closed", feature: "Photo search" },
  /** /api/videos/[id]: counts a view once an hour; never refuses anything. */
  videoView: { per: "IP and video", count: 1, window: "1 h", whenDown: "open", feature: "Video views" },
} as const satisfies Record<string, LimitSpec>;

export type LimitName = keyof typeof LIMITS;

/** What a limit does when Upstash is missing or did not answer. */
export function whenUpstashDown(whenDown: WhenDown, production: boolean): "allow" | "refuse" {
  return production && whenDown === "closed" ? "refuse" : "allow";
}
