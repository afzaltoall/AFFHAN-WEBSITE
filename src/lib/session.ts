import crypto from "crypto";
import { cookies } from "next/headers";

// Lightweight signed-cookie session (HMAC-SHA256), so we don't need an auth
// framework or Edge-incompatible deps. Runs in the Node runtime (API routes
// and server components), which is where we read/verify it.

const SECRET = process.env.AUTH_SECRET || "affhan_dev_secret";
export const SESSION_COOKIE = "affhan_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  image?: string | null;
  /**
   * Employee sessions only: the Employee.tokenVersion this cookie was signed
   * against, so bumping that column invalidates cookies already in the wild.
   * See lib/employee-session.ts. Admin cookies do not carry it.
   */
  tokenVersion?: number;
}

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

export function signSession(user: SessionUser): string {
  const payload = b64url(JSON.stringify({ ...user, iat: Date.now() }));
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/**
 * The payload, plus when it was signed.
 *
 * signSession has always written `iat`, and until employee sessions arrived
 * nothing ever read it: a cookie was good until the browser dropped it, thirty
 * days later. An idle timeout has to be judged against a timestamp the server
 * signed rather than one the page reports, so it is read back here.
 */
export function readSession(
  token: string | undefined
): { user: SessionUser; issuedAt: number | null } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  // constant-time compare
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return {
      user: {
        id: data.id,
        email: data.email,
        name: data.name ?? null,
        role: data.role,
        image: data.image ?? null,
        ...(typeof data.tokenVersion === "number" ? { tokenVersion: data.tokenVersion } : {}),
      },
      issuedAt: typeof data.iat === "number" ? data.iat : null,
    };
  } catch {
    return null;
  }
}

export function verifySession(token: string | undefined): SessionUser | null {
  return readSession(token)?.user ?? null;
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};

// Read the current user from the request cookies (server-side).
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}
