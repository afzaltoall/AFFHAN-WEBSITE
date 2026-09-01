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

export async function checkImageSearchRateLimit(req: NextRequest) {
  if (!imageSearchLimiter) return { success: true };
  
  try {
    const ip = getClientIp(req);
    const { success, limit, remaining, reset } = await imageSearchLimiter.limit(`search_image:${ip}`);
    return { success, limit, remaining, reset };
  } catch (error) {
    console.error("Redis Image Search RateLimit Error:", error);
    // Fail safely (open) if Redis is down
    return { success: true };
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
