import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { NextResponse } from "next/server";
import { protectionsRequired } from "@/lib/protections";

// Fallback to null if env variables are missing, meaning Redis is not available
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

/** What every limit here answers. `unavailable`: refused because Upstash is not set up, not because it is spent. */
export type LimitResult = {
  success: boolean;
  limit?: number;
  remaining?: number;
  reset?: number;
  unavailable?: true;
};

/** Only the headers are read, so a plain Request does as well as a NextRequest. */
type HasHeaders = Pick<Request, "headers">;

const warned = new Set<string>();

/**
 * The answer of a limit Upstash is not set up for (security audit 2026-10-08,
 * H5).
 *
 * Sign-in, password reset and photo search (Gemini, paid per call) refuse in
 * production: until now every limit here let everything through without
 * Redis, silently, which is how the site has run. Under `next dev` they still
 * step aside, with a warning (lib/protections.ts). The video-view and
 * trip-application limits are left as they were.
 *
 * Upstash failing at run time is a different case and still lets requests
 * through: an outage there must not lock every customer out of sign-in, and
 * the sign-in lockout (lib/password.ts) is in the database, not in Redis.
 */
function notSetUp(name: string): LimitResult {
  const refuse = protectionsRequired();
  if (!warned.has(name)) {
    warned.add(name);
    if (refuse) {
      console.error(`[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set: ${name} is refused until they are.`);
    } else {
      console.warn(`[rate-limit] Upstash is not configured; the ${name} limit is off (development only).`);
    }
  }
  return refuse ? { success: false, unavailable: true } : { success: true };
}

/**
 * The reply for a limit that refused because it is not set up: 503, not 429,
 * so nobody is told they tried too often when they did not. `what` names the
 * feature, as in "Sign-in is unavailable right now."
 */
export function limiterUnavailable(what: string): NextResponse {
  return NextResponse.json(
    { error: `${what} is unavailable right now. Please try again later.` },
    { status: 503, headers: { "Retry-After": "300" } }
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

// ============================================================================
// Login Brute Force Protection (5 attempts per 15 minutes per IP)
// ============================================================================
const loginLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      analytics: false,
    })
  : null;

export async function checkLoginRateLimit(req: HasHeaders): Promise<LimitResult> {
  if (!loginLimiter) return notSetUp("sign-in");
  
  try {
    const ip = getClientIp(req);
    const { success, limit, remaining, reset } = await loginLimiter.limit(`login:${ip}`);
    return { success, limit, remaining, reset };
  } catch (error) {
    console.error("Redis Login RateLimit Error:", error);
    // Fail safely (open) if Redis is down
    return { success: true };
  }
}

// ============================================================================
// Image Search Abuse Protection (30 requests per 1 hour per IP)
// ============================================================================
const imageSearchLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "1 h"),
      analytics: false,
    })
  : null;

/**
 * How long a photo search waits on the limiter. Redis that is down already
 * lets the search through; Redis that is slow held it with nothing to show
 * but the page's sweep (the owner's report, 2026-10-07: "the scanner sticks
 * sometimes"), so slow lets it through too.
 */
const IMAGE_LIMIT_WAIT_MS = 1_500;

export async function checkImageSearchRateLimit(req: HasHeaders): Promise<LimitResult> {
  if (!imageSearchLimiter) return notSetUp("photo search");

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ip = getClientIp(req);
    const { success, limit, remaining, reset } = await Promise.race([
      imageSearchLimiter.limit(`search_image:${ip}`),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no answer in ${IMAGE_LIMIT_WAIT_MS}ms`)), IMAGE_LIMIT_WAIT_MS);
      }),
    ]);
    return { success, limit, remaining, reset };
  } catch (error) {
    console.error("Redis Image Search RateLimit Error:", error);
    // Fail safely (open) if Redis is down, or too slow to wait for
    return { success: true };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================================
// Video View Deduplication (1 increment per 1 hour per IP + Video ID)
// ============================================================================
const videoViewLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(1, "1 h"), // 1 request per hour per video per IP
      analytics: false,
    })
  : null;

export async function checkVideoViewRateLimit(req: HasHeaders, videoId: string) {
  if (!videoViewLimiter) return { success: true };
  
  try {
    const ip = getClientIp(req);
    // Unique key per IP AND per video
    const { success, limit, remaining, reset } = await videoViewLimiter.limit(`view_video:${videoId}:${ip}`);
    return { success, limit, remaining, reset };
  } catch (error) {
    console.error("Redis Video View RateLimit Error:", error);
    // Fail safely (open) if Redis is down
    return { success: true };
  }
}

// ============================================================================
// Password-reset codes (5 requests per 15 minutes per IP)
//
// The per-IP half of the pair. The per-address half lives in lib/email-otp.ts
// and is enforced in the database. This one refuses in production while
// UPSTASH_REDIS_REST_* are not set (notSetUp, above), and lets requests
// through under `next dev`.
//
// Five rather than three: one IP is a household, an office or a mobile
// carrier's NAT, so the address limit is the one that should bite first.
// ============================================================================
const passwordResetLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      analytics: false,
    })
  : null;

export async function checkPasswordResetRateLimit(req: HasHeaders): Promise<LimitResult> {
  if (!passwordResetLimiter) return notSetUp("password reset");

  try {
    const ip = getClientIp(req);
    const { success, limit, remaining, reset } = await passwordResetLimiter.limit(`pwreset:${ip}`);
    return { success, limit, remaining, reset };
  } catch (error) {
    console.error("Redis Password Reset RateLimit Error:", error);
    // Fail safely (open) if Redis is down.
    return { success: true };
  }
}

// ============================================================================
// Free China trip applications (5 per hour per IP)
// ============================================================================
// Public and unauthenticated, like the contact form, but each application is
// a long record a person reads in the console: a few genuine attempts an hour
// is plenty, and a script is stopped before it fills the list.
const tripApplicationLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "60 m"),
      analytics: false,
    })
  : null;

export async function checkTripApplicationRateLimit(req: HasHeaders) {
  if (!tripApplicationLimiter) return { success: true };
  try {
    const ip = getClientIp(req);
    const { success } = await tripApplicationLimiter.limit(`trip:${ip}`);
    return { success };
  } catch (error) {
    console.error("Redis Trip Application RateLimit Error:", error);
    // Fail safely (open) if Redis is down.
    return { success: true };
  }
}
