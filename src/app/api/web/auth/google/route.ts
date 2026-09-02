import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/prisma";
import { createWebSession, publicUser, setSessionCookie } from "@/lib/web-session";

export const dynamic = "force-dynamic";

// The same Web client the app verifies against, so one Google account is one
// customer whether they arrive from the phone or the browser.
const CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID || "";
const client = new OAuth2Client(CLIENT_ID);

/**
 * Sign in with the credential Google Identity Services hands the browser.
 *
 * The token is verified here, never trusted from the client: a POST body is
 * something anyone can write, and only Google's signature over the audience
 * proves it came from Google for this application.
 */
export async function POST(request: Request) {
  try {
    if (!CLIENT_ID) {
      console.error("[google] GOOGLE_WEB_CLIENT_ID is not set; sign-in cannot be verified.");
      return NextResponse.json({ error: "Google sign-in is not available yet." }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const idToken = typeof body?.idToken === "string" ? body.idToken : "";
    if (!idToken) {
      return NextResponse.json({ error: "Missing Google credential." }, { status: 400 });
    }

    const ticket = await client
      .verifyIdToken({ idToken, audience: CLIENT_ID })
      .catch(() => null);
    const payload = ticket?.getPayload();

    if (!payload) {
      return NextResponse.json({ error: "Could not verify that Google account." }, { status: 401 });
    }

    const { email, sub: googleId, name, picture, email_verified } = payload;
    if (!email || !email_verified) {
      return NextResponse.json(
        { error: "Your Google account needs a verified email." },
        { status: 400 }
      );
    }

    const emailNormalized = email.toLowerCase().trim();

    // Existing account by email — including one made by phone — gets Google
    // attached rather than a second account created for the same person.
    let user = await prisma.mobileUser.findUnique({ where: { email: emailNormalized } });

    if (user) {
      if (!user.googleId) {
        user = await prisma.mobileUser.update({
          where: { id: user.id },
          data: {
            googleId,
            authProvider: user.authProvider.includes("GOOGLE")
              ? user.authProvider
              : `${user.authProvider}_AND_GOOGLE`,
            profileImage: user.profileImage || picture,
            emailVerified: true,
          },
        });
      }
    } else {
      user = await prisma.mobileUser.create({
        data: {
          name: name || "Google User",
          email: emailNormalized,
          authProvider: "GOOGLE",
          googleId,
          profileImage: picture,
          emailVerified: true,
        },
      });
    }

    if (user.accountStatus !== "ACTIVE") {
      return NextResponse.json({ error: "This account is not active." }, { status: 403 });
    }

    const updated = await prisma.mobileUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), loginCount: { increment: 1 } },
    });

    const session = await createWebSession(updated.id);

    return setSessionCookie(
      NextResponse.json({ success: true, user: publicUser(updated) }),
      session
    );
  } catch (error) {
    console.error("Web Google auth error:", error);
    return NextResponse.json({ error: "Google sign-in failed. Please try again." }, { status: 500 });
  }
}
