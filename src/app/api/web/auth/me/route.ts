import { NextResponse } from "next/server";
import { verifyMobileSession } from "@/lib/mobile-auth";
import { publicUser } from "@/lib/web-session";

export const dynamic = "force-dynamic";

/**
 * Who is signed in, from the httpOnly cookie.
 *
 * AuthContext calls this once on mount, which is what makes a returning
 * visitor on the same device already signed in — the cookie was sent with the
 * request, so nothing had to be remembered in JavaScript.
 */
export async function GET(request: Request) {
  try {
    const user = await verifyMobileSession(request);
    // 200 with a null user, not 401.
    //
    // "Nobody is signed in" is the correct answer to "who is signed in", not a
    // failure to answer it. Returning 401 made every browser log a red console
    // error on every page load for every signed-out visitor — and on the admin
    // console, which has an admin cookie but no customer one, it fired on all
    // of them. The body was already { user: null } and AuthContext already
    // treats a non-ok response and a null user identically, so nothing
    // downstream changes.
    if (!user) return NextResponse.json({ user: null });
    return NextResponse.json({ user: publicUser(user) });
  } catch (error) {
    console.error("Web me error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
