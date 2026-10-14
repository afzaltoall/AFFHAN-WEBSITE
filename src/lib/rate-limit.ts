import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { NextResponse } from "next/server";
import { protectionsRequired } from "@/lib/protections";
import { LIMITS, whenUpstashDown, type LimitName } from "@/lib/limit-policy";
import { waitPhrase } from "@/lib/login-lockout";

// ---------------------------------------------------------------------------
// Rate limits, counted in Upstash. lib/limit-policy.ts is the table: who each
// limit counts, how many, over what window, and whether it refuses (closed) or
// lets requests through (open) when Upstash is missing or does not answer.
//
// "Does not answer" needed care. @upstash/ratelimit races Redis against its
// own timer and, when the timer wins, answers success with reason "timeout":
// it fails open by itself, silently, after five seconds. And @upstash/redis
// retries a failed request five times with growing waits first. Both are
// shortened here, and a "timeout" answer counts as Upstash being down, so a
// limit that must fail closed really does.
// ---------------------------------------------------------------------------

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
        retry: { retries: 1, backoff: () => 100 },
      })
    : null;

/** How long a limit waits for Upstash before treating it as down. */
const WAIT_MS = 1_500;

/** What every limit here answers. `unavailable`: refused because Upstash is missing or down, not because it is spent. */
export type LimitResult = {
  success: boolean;
  limit?: number;
  remaining?: number;
  /** When the window resets, epoch ms. */
  reset?: number;
  unavailable?: true;
};

/** Only the headers are read, so a plain Request does as well as a NextRequest. */
type HasHeaders = Pick<Request, "headers">;

const limiters = new Map<LimitName, Ratelimit>();
function limiterFor(name: LimitName): Ratelimit | null {
  if (!redis) return null;
  let limiter = limiters.get(name);
  if (!limiter) {
    const spec = LIMITS[name];
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(spec.count, spec.window),
      prefix: `ratelimit:${name}`,
      timeout: WAIT_MS,
      analytics: false,
    });
    limiters.set(name, limiter);
  }
  return limiter;
}

// An outage would otherwise write a line per request; one a minute per limit
// and cause is enough to see it.
const lastLogged = new Map<string, number>();
function logSometimes(key: string, log: () => void) {
  const now = Date.now();
  if ((lastLogged.get(key) ?? 0) > now - 60_000) return;
  lastLogged.set(key, now);
  log();
}

function upstashDown(name: LimitName, cause: "missing" | "timeout" | "error", error?: unknown): LimitResult {
  const spec = LIMITS[name];
  const production = protectionsRequired();
  const why =
    cause === "missing"
      ? "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set"
      : cause === "timeout"
        ? `Upstash did not answer within ${WAIT_MS} ms`
        : `Upstash failed (${error instanceof Error ? error.name : "unknown"})`;
  if (whenUpstashDown(spec.whenDown, production) === "refuse") {
    logSometimes(`${name}:${cause}`, () => console.error(`[rate-limit] ${why}: ${name} fails closed, requests are refused.`));
    return { success: false, unavailable: true };
  }
  logSometimes(`${name}:${cause}`, () =>
    console.warn(
      production
        ? `[rate-limit] ${why}: ${name} fails open, requests go through without this limit.`
        : `[rate-limit] ${why}: the ${name} limit is off (development).`
    )
  );
  return { success: true };
}

/** Count one request against `name` for `identifier`, following the table's policy when Upstash is down. */
export async function checkLimit(name: LimitName, identifier: string): Promise<LimitResult> {
  const limiter = limiterFor(name);
  if (!limiter) return upstashDown(name, "missing");
  try {
    const r = await limiter.limit(identifier);
    if (r.reason === "timeout") return upstashDown(name, "timeout");
    return { success: r.success, limit: r.limit, remaining: r.remaining, reset: r.reset };
  } catch (error) {
    return upstashDown(name, "error", error);
  }
}

/**
 * The reply for a limit that refused because Upstash is missing or down: 503,
 * not 429, so nobody is told they tried too often when they did not. `what`
 * names the feature, as in "Sign-in is unavailable right now."
 */
export function limiterUnavailable(what: string): NextResponse {
  return NextResponse.json(
    { error: `${what} is unavailable right now. Please try again in a few minutes.` },
    { status: 503, headers: { "Retry-After": "300" } }
  );
}

/**
 * The reply when a limit is reached: 429, a sentence saying what happened and
 * how long to wait ("Please try again in 12 minutes."), the same wait in
 * Retry-After and retryAfterSeconds, and reason "rate_limited". Every form
 * shows `error` where it shows any other refusal, so reaching a limit is a
 * line of text in place, never an error page (2026-10-14).
 *
 * `say` comes first ("You have done a lot of photo searches in the last
 * hour."); `then`, if given, after the wait ("Searching by name still works.").
 */
export function limitReached(say: string, r: LimitResult, then?: string): NextResponse {
  const ms = Math.max(1_000, (r.reset ?? Date.now() + 60_000) - Date.now());
  const seconds = Math.ceil(ms / 1000);
  return NextResponse.json(
    { error: `${say} Please try again in ${waitPhrase(ms)}.${then ? ` ${then}` : ""}`, reason: "rate_limited", retryAfterSeconds: seconds },
    { status: 429, headers: { "Retry-After": String(seconds) } }
  );
}

/**
 * Helper to get the client IP from Next.js headers (Vercel sets x-forwarded-for).
 */
export function getClientIp(req: HasHeaders): string {
  // On Vercel, x-real-ip or x-forwarded-for will contain the client IP
  const ip = req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for");
  // Some headers contain multiple IPs (e.g., 'ip1, ip2'); take the first one
  return ip ? ip.split(",")[0].trim() : "127.0.0.1";
}

/** The console's sign-in, per connection. Fails closed. */
export const checkConsoleLoginRateLimit = (req: HasHeaders) => checkLimit("consoleLogin", getClientIp(req));

/** The staff sign-in, per connection. Fails closed. */
export const checkStaffLoginRateLimit = (req: HasHeaders) => checkLimit("staffLogin", getClientIp(req));

/** Customers' sign-in, website and app on one count, per connection. Fails open: the database lockout holds. */
export const checkCustomerLoginRateLimit = (req: HasHeaders) => checkLimit("customerLogin", getClientIp(req));

/**
 * Password reset, every step of both flows, per connection. Fails open: the
 * per-address caps in lib/email-otp.ts are in the database and always hold.
 */
export const checkPasswordResetRateLimit = (req: HasHeaders) => checkLimit("passwordReset", getClientIp(req));

/** The contact form, per connection. Fails open: Turnstile and the per-sender cap hold. */
export const checkContactRateLimit = (req: HasHeaders) => checkLimit("contact", getClientIp(req));

/** Quote requests, website and app, per signed-in account. Fails open. */
export const checkInquiryRateLimit = (userId: string) => checkLimit("inquiry", userId);

/** Free China trip applications, website and app, per connection. Fails open. */
export const checkTripApplicationRateLimit = (req: HasHeaders) => checkLimit("tripApplication", getClientIp(req));

/**
 * Photo search, website and app: each signed-in account (anyone signed out, by
 * connection), and a ceiling per connection over every account behind it.
 * Both fail closed: every search is a paid model call.
 */
export async function checkImageSearchRateLimit(req: HasHeaders, accountId: string | null): Promise<LimitResult> {
  const ip = getClientIp(req);
  const [own, ceiling] = await Promise.all([
    checkLimit("photoSearch", accountId ? `account:${accountId}` : `ip:${ip}`),
    checkLimit("photoSearchPerIp", ip),
  ]);
  if (own.unavailable || ceiling.unavailable) return { success: false, unavailable: true };
  return !own.success ? own : !ceiling.success ? ceiling : own;
}

/** A video view counted once an hour per connection; never refuses the video itself. */
export const checkVideoViewRateLimit = (req: HasHeaders, videoId: string) =>
  checkLimit("videoView", `${videoId}:${getClientIp(req)}`);
