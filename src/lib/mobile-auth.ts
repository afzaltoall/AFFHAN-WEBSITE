import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * How long a sign-in lasts, for the app and the website alike.
 *
 * Absolute, not sliding: verifyMobileSession never moves expiresAt forward, so
 * this counts from the moment of signing in and the customer signs in again on
 * the thirtieth day however much they used it. Changing that is a decision,
 * not a tidy-up — the value here only says how long.
 *
 * It lives in this module because this is where sessions are made. It used to
 * live in phone-auth, which meant the browser path pulled the whole Twilio
 * module in to read one number, and the four app login routes did not read it
 * at all — each wrote its own 30, so changing this constant would have moved
 * the website and left the app behind.
 */
export const SESSION_DAYS = 30;

export const MOBILE_TOKEN_BYTES = 32;

/**
 * Generates a cryptographically secure random token for a mobile session.
 * Returns both the raw token (to send to the client) and its SHA-256 hash (to store in the database).
 */
export function generateMobileSessionToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(MOBILE_TOKEN_BYTES).toString("base64url");
  const tokenHash = hashMobileToken(rawToken);
  return { rawToken, tokenHash };
}

/**
 * Hashes a given raw token using SHA-256 for secure database lookup.
 */
export function hashMobileToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Extracts the Bearer token from the Request headers.
 */
export function extractBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7);
}

/**
 * The website's session cookie.
 *
 * A browser cannot hold a Bearer token the way the app does: anywhere script
 * can read it, an XSS can read it too. So the same session token travels as an
 * httpOnly cookie instead — same table, same hash, same expiry, only a
 * different envelope.
 *
 * Named apart from the admin console's `affhan_session`, because these are
 * different populations with different privileges and must never be mistaken
 * for one another.
 */
/**
 * Label a session that phone-auth already created.
 *
 * authenticateByPhone is shared by the app and the website and opens the
 * session itself, deliberately without a platform — neither caller's answer
 * would be right for the other. Each one stamps it afterwards, found by the
 * hash of the token it was just handed.
 */
export async function markSessionPlatform(
  rawToken: string,
  platform: "WEB" | "APP"
): Promise<void> {
  await prisma.mobileSession
    .update({ where: { tokenHash: hashMobileToken(rawToken) }, data: { platform } })
    .catch(() => {
      // Not worth failing a successful sign-in over a label.
    });
}

export const WEB_SESSION_COOKIE = "affhan_user";

export function webSessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    // Lax rather than Strict: a customer following a link to a product from
    // an email or search result should already be signed in when they land,
    // and Lax still withholds the cookie from cross-site POSTs.
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}

/** The raw token from the website cookie, if the request carries one. */
export function extractSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === WEB_SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/**
 * Verifies a customer session from the request.
 *
 * Accepts either envelope: the app's `Authorization: Bearer`, or the website's
 * httpOnly cookie. Both carry the same opaque token against the same
 * MobileSession row, so a customer is one account whichever they signed in on.
 *
 * The header is checked first. If a request somehow carries both, the explicit
 * one wins over the one the browser attached on its own.
 */
export async function verifyMobileSession(request: Request) {
  const rawToken = extractBearerToken(request) ?? extractSessionCookie(request);
  if (!rawToken) {
    return null;
  }

  const tokenHash = hashMobileToken(rawToken);

  const session = await prisma.mobileSession.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  // Check expiration
  if (session.expiresAt < new Date()) {
    // Optionally clean up expired session
    await prisma.mobileSession.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Check if account is suspended
  if (session.user.accountStatus !== "ACTIVE") {
    return null;
  }

  return session.user;
}
