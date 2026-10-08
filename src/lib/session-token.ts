import crypto from "crypto";
import { authSecret, authSecretOrNull } from "@/lib/secrets";

// Lightweight signed-cookie session (HMAC-SHA256), so we don't need an auth
// framework or Edge-incompatible deps. Runs in the Node runtime (API routes
// and server components), which is where we read/verify it.
//
// Signed with AUTH_SECRET and nothing else (lib/secrets.ts): there is no
// fallback key any more, so signing without the variable throws, and checking
// without it accepts no cookie at all.
//
// The token alone, with no database: src/proxy.ts reads it, and the proxy
// carries no Prisma. lib/session.ts re-exports all of this and adds the
// checks that need the database, so everything else imports from there.

export const SESSION_COOKIE = "affhan_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const ADMIN_ROLE = "admin";

/**
 * Thirty minutes with no sign of life from the console, and the admin session
 * is over.
 *
 * This is the same policy the console has always had — it is where the policy
 * now lives that changed. It used to be a timer inside AdminAutoLogout, which
 * also ended the session from the browser's unload path: `pagehide` sent a
 * logout beacon, on the reasoning that a document going away meant the admin
 * had left.
 *
 * A document goes away for reasons that have nothing to do with leaving. Next's
 * router replaces it itself whenever an RSC fetch comes back unusable — after a
 * deployment (the build id no longer matches), on any non-200, on a dropped
 * request — and a plain reload does it too. Each of those fired the beacon, so
 * clicking around the console signed the admin out at random, and the tab that
 * came back looked signed in until the next request 401'd.
 *
 * Judged here instead, against the `iat` the server itself signed: no browser
 * event can end a session early, and none can extend one either. A console that
 * stops asking simply stops sliding the window, which is what closing the tab
 * now means.
 */
export const ADMIN_IDLE_MS = 30 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  image?: string | null;
  /**
   * The tokenVersion of the row this cookie was signed against: Employee for a
   * staff cookie (lib/employee-session.ts), AdminUser for an admin one
   * (lib/session.ts). Bumping the column invalidates cookies already in the
   * wild.
   */
  tokenVersion?: number;
}

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

export function signSession(user: SessionUser): string {
  const payload = b64url(JSON.stringify({ ...user, iat: Date.now() }));
  const sig = crypto.createHmac("sha256", authSecret()).update(payload).digest("base64url");
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
  const secret = authSecretOrNull();
  if (!secret) return null;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
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

/** The options an admin cookie is written with: it lapses with the window. */
export const adminCookieOptions = { ...cookieOptions, maxAge: Math.floor(ADMIN_IDLE_MS / 1000) };

/** Is a cookie signed at `issuedAt` still inside the idle window? */
export function adminSessionIsFresh(issuedAt: number | null): boolean {
  // No issued-at cannot be aged, so it is not trusted. Nothing signs one
  // without it; this is the "forged or ancient" branch.
  return issuedAt !== null && Date.now() - issuedAt <= ADMIN_IDLE_MS;
}
