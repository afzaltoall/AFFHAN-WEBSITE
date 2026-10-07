import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { NextRequest } from "next/server";

// Fallback to null if env variables are missing, meaning Redis is not available
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

/**
 * Helper to get the client IP from Next.js headers (Vercel sets x-forwarded-for).
 */
export function getClientIp(req: NextRequest): string {
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

export async function checkLoginRateLimit(req: NextRequest) {
  if (!loginLimiter) return { success: true };
  
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

export async function checkImageSearchRateLimit(req: NextRequest) {
  if (!imageSearchLimiter) return { success: true };

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

export async function checkVideoViewRateLimit(req: NextRequest, videoId: string) {
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
// and is enforced in the database, because this one fails open when Upstash is
// not configured — which it is not today, so treat this as defence that will
// switch on when UPSTASH_REDIS_REST_* are set, not as the limit that is
// currently holding.
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

export async function checkPasswordResetRateLimit(req: NextRequest) {
  if (!passwordResetLimiter) return { success: true };

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

export async function checkTripApplicationRateLimit(req: NextRequest) {
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
