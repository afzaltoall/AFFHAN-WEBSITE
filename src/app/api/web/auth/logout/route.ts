import { NextResponse } from "next/server";
import { extractSessionCookie } from "@/lib/mobile-auth";
import { clearSessionCookie, destroyWebSession } from "@/lib/web-session";

export const dynamic = "force-dynamic";

/**
 * Sign out.
 *
 * The row goes as well as the cookie. Clearing the cookie alone would leave a
 * token that still works for anyone who captured it, which is the whole reason
 * sessions are stored rather than self-describing.
 *
 * Answers success even when there was no session, so a double click or a stale
 * tab does not show an error for reaching the state it wanted.
 */
export async function POST(request: Request) {
  try {
    await destroyWebSession(extractSessionCookie(request));
    return clearSessionCookie(NextResponse.json({ success: true }));
  } catch (error) {
    console.error("Web logout error:", error);
    return clearSessionCookie(NextResponse.json({ success: true }));
  }
}
