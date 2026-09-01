import crypto from "crypto";
import { prisma } from "@/lib/prisma";

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
 * Verifies a mobile session based on the provided Request.
 * Looks up the hashed token in the database, ensures it's not expired, 
 * and returns the associated MobileUser if valid.
 */
export async function verifyMobileSession(request: Request) {
  const rawToken = extractBearerToken(request);
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
