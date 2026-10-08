import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ADMIN_ROLE,
  SESSION_COOKIE,
  adminCookieOptions,
  adminSessionIsFresh,
  readSession,
  signSession,
  type SessionUser,
} from "@/lib/session-token";

// The signed cookie itself is lib/session-token.ts, which the proxy reads
// without a database. This adds what a cookie cannot prove on its own and
// re-exports the rest, so every `@/lib/session` import works as it did.
export * from "@/lib/session-token";

export type AdminAuthFailure = "no_session" | "not_admin" | "idle_expired";

export type AdminAuth =
  | { ok: true; user: SessionUser; issuedAt: number }
  | { ok: false; reason: AdminAuthFailure };

/**
 * Is this admin cookie signed against the version its account is on now?
 *
 * AdminUser.tokenVersion goes up when the password changes, and every cookie
 * signed before that stops here (security audit 2026-10-08, M4); until then a
 * signed cookie was good for its whole window whatever happened to the
 * account. A cookie with no version was signed before versions were written
 * and is refused like a stale one, which costs one sign-in after the deploy.
 * One lookup by primary key per guarded request: the price the staff sessions
 * already pay (lib/employee-session.ts).
 */
export async function adminTokenIsCurrent(user: SessionUser): Promise<boolean> {
  if (typeof user.tokenVersion !== "number") return false;
  const admin = await prisma.adminUser.findUnique({
    where: { id: user.id },
    select: { tokenVersion: true },
  });
  return admin !== null && admin.tokenVersion === user.tokenVersion;
}

/**
 * The current admin, with the reason when there isn't one.
 *
 * getCurrentUser answers the same question for the thirty-odd routes that only
 * need yes or no. This exists for the one caller that has to tell "timed out"
 * from "never signed in", so the login page can say which. A revoked cookie
 * reads as "no_session": signing in again is what it needs.
 */
export async function readAdminSession(): Promise<AdminAuth> {
  const store = await cookies();
  const parsed = readSession(store.get(SESSION_COOKIE)?.value);
  if (!parsed) return { ok: false, reason: "no_session" };
  if (parsed.user.role !== ADMIN_ROLE) return { ok: false, reason: "not_admin" };
  if (!adminSessionIsFresh(parsed.issuedAt)) return { ok: false, reason: "idle_expired" };
  if (!(await adminTokenIsCurrent(parsed.user))) return { ok: false, reason: "no_session" };
  return { ok: true, user: parsed.user, issuedAt: parsed.issuedAt as number };
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
 * Admin cookies are aged and version-checked here, so every console page and
 * every admin API route inherits both without each one remembering to check.
 * Employee cookies pass through untouched: lib/employee-session.ts judges
 * those, and it has more to check than a timestamp.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const parsed = readSession(store.get(SESSION_COOKIE)?.value);
  if (!parsed) return null;
  if (parsed.user.role === ADMIN_ROLE) {
    if (!adminSessionIsFresh(parsed.issuedAt)) return null;
    if (!(await adminTokenIsCurrent(parsed.user))) return null;
  }
  return parsed.user;
}
