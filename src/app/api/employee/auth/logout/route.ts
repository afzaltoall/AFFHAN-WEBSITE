import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { dropLegacyStaffCookie, STAFF_SESSION_COOKIE, staffCookieOptions } from "@/lib/employee-session";

export const dynamic = "force-dynamic";

/**
 * Sign out.
 *
 * Clearing the cookie is the whole of it: the session is the signed cookie, so
 * a browser without it holds nothing. Only the staff cookie — an admin session
 * held in the same browser is somebody else's to end.
 */
export async function POST(request: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(STAFF_SESSION_COOKIE, "", { ...staffCookieOptions, maxAge: 0 });
  return dropLegacyStaffCookie(res, request.cookies.get(SESSION_COOKIE)?.value);
}
