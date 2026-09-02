import type { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateMobileSessionToken,
  hashMobileToken,
  markSessionPlatform,
  WEB_SESSION_COOKIE,
  webSessionCookieOptions,
} from "@/lib/mobile-auth";
import { SESSION_DAYS } from "@/lib/phone-auth";

// ---------------------------------------------------------------------------
// Browser sessions, on the same table the app uses.
//
// A browser cannot hold a Bearer token safely — anywhere script can read it, an
// XSS can too — so the identical opaque token travels as an httpOnly cookie
// instead. Same row, same hash, same expiry; only the envelope differs.
// ---------------------------------------------------------------------------

export interface WebSession {
  rawToken: string;
  expiresAt: Date;
}

/** Open a browser session for a customer. */
export async function createWebSession(userId: string): Promise<WebSession> {
  const { rawToken, tokenHash } = generateMobileSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

  await prisma.mobileSession.create({
    data: { tokenHash, userId, expiresAt, platform: "WEB" },
  });

  return { rawToken, expiresAt };
}

/**
 * Mark a session that phone-auth already created as a browser one.
 *
 * authenticateByPhone is shared with the app and opens the session itself, and
 * it is deliberately left untouched — so the platform is stamped afterwards,
 * found by the hash of the token it just returned.
 */
export async function markSessionAsWeb(rawToken: string): Promise<void> {
  await markSessionPlatform(rawToken, "WEB");
}

export function setSessionCookie(res: NextResponse, session: WebSession): NextResponse {
  res.cookies.set(WEB_SESSION_COOKIE, session.rawToken, webSessionCookieOptions(session.expiresAt));
  return res;
}

/** Drop the row as well as the cookie: a signed-out token must stop working. */
export async function destroyWebSession(rawToken: string | null): Promise<void> {
  if (!rawToken) return;
  await prisma.mobileSession
    .deleteMany({ where: { tokenHash: hashMobileToken(rawToken) } })
    .catch(() => {});
}

export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set(WEB_SESSION_COOKIE, "", {
    ...webSessionCookieOptions(new Date(0)),
    maxAge: 0,
  });
  return res;
}

/** The shape the browser is given. Never includes passwordHash or googleId. */
export function publicUser(user: {
  id: string;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string | null;
  phone: string | null;
  authProvider: string;
  profileImage: string | null;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  createdAt?: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    // The two halves as stored. The account form needs them separately, and
    // splitting `name` on a space to recover them mangles double-barrelled
    // surnames and mononyms.
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    email: user.email,
    phone: user.phone,
    authProvider: user.authProvider,
    profileImage: user.profileImage,
    // What the account page reports back. Deliberately not `accountStatus`:
    // verifyMobileSession refuses a session on anything but ACTIVE, so a
    // signed-in visitor could only ever be told "Active" — a field with one
    // possible value is furniture. These three do vary, and each one answers a
    // question a customer actually asks about their own account.
    emailVerified: user.emailVerified ?? false,
    phoneVerified: user.phoneVerified ?? false,
    createdAt: user.createdAt ? user.createdAt.toISOString() : null,
  };
}
