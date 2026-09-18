import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

// Lightweight signed-cookie session (HMAC-SHA256), so we don't need an auth
// framework or Edge-incompatible deps. Runs in the Node runtime (API routes
// and server components), which is where we read/verify it.

const SECRET = process.env.AUTH_SECRET || "affhan_dev_secret";
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

export type AdminAuthFailure = "no_session" | "not_admin" | "idle_expired";

export type AdminAuth =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: AdminAuthFailure };

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

/** The options an admin cookie is written with: it lapses with the window. */
export const adminCookieOptions = { ...cookieOptions, maxAge: Math.floor(ADMIN_IDLE_MS / 1000) };

/** Is a cookie signed at `issuedAt` still inside the idle window? */
export function adminSessionIsFresh(issuedAt: number | null): boolean {
  // No issued-at cannot be aged, so it is not trusted. Nothing signs one
  // without it; this is the "forged or ancient" branch.
  return issuedAt !== null && Date.now() - issuedAt <= ADMIN_IDLE_MS;
}

/**
 * The current admin, with the reason when there isn't one.
 *
 * getCurrentUser answers the same question for the thirty-odd routes that only
 * need yes or no. This exists for the one caller that has to tell "timed out"
 * from "never signed in", so the login page can say which.
 */
export async function readAdminSession(): Promise<AdminAuth> {
  const store = await cookies();
  const parsed = readSession(store.get(SESSION_COOKIE)?.value);
  if (!parsed) return { ok: false, reason: "no_session" };
  if (parsed.user.role !== ADMIN_ROLE) return { ok: false, reason: "not_admin" };
  if (!adminSessionIsFresh(parsed.issuedAt)) return { ok: false, reason: "idle_expired" };
  return { ok: true, user: parsed.user };
}

/**
 * Slide the idle window forward.
 *
 * One caller, deliberately: the console's keep-alive route. Every admin page
 * and API route reads the session, but a server component cannot set a cookie,
 * and spreading the refresh across the write routes would mean the window
 * depended on which button somebody happened to press.
 */
export function refreshAdminCookie(res: NextResponse, user: SessionUser): NextResponse {
  res.cookies.set(SESSION_COOKIE, signSession(user), adminCookieOptions);
  return res;
}

/**
 * Read the current user from the request cookies (server-side).
 *
 * Admin cookies are aged here, so every console page and every admin API route
 * inherits the timeout without each one remembering to check. Employee cookies
 * pass through untouched: lib/employee-session.ts judges those, and it has more
 * to check than a timestamp.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const parsed = readSession(store.get(SESSION_COOKIE)?.value);
  if (!parsed) return null;
  if (parsed.user.role === ADMIN_ROLE && !adminSessionIsFresh(parsed.issuedAt)) return null;
  return parsed.user;
}
