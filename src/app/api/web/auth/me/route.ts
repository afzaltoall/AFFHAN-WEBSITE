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
    if (!user) return NextResponse.json({ user: null }, { status: 401 });
    return NextResponse.json({ user: publicUser(user) });
  } catch (error) {
    console.error("Web me error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
