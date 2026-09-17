import { NextResponse } from "next/server";
import { SESSION_COOKIE, cookieOptions } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Sign out.
 *
 * Clearing the cookie is the whole of it: the session is the signed cookie, so
 * a browser without it holds nothing. POST, because navigator.sendBeacon sends
 * POST — the workspace uses it when the tab closes.
 */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return res;
}
