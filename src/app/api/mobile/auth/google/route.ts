import { NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/prisma";
import { generateMobileSessionToken } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

// Web Client ID used by the Flutter backend integration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID || "";
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

export async function POST(request: Request) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: "Missing Google ID token." }, { status: 400 });
    }

    if (!GOOGLE_CLIENT_ID) {
      console.warn("GOOGLE_WEB_CLIENT_ID is not configured in environment variables.");
      return NextResponse.json({ error: "Google authentication is not configured on the server." }, { status: 500 });
    }

    // Verify token with Google
    const ticket = await client.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return NextResponse.json({ error: "Invalid Google ID token." }, { status: 401 });
    }

    const { email, sub: googleId, name, picture, email_verified } = payload;

    if (!email || !email_verified) {
      return NextResponse.json({ error: "A verified email is required from Google." }, { status: 400 });
    }

    const emailNormalized = email.toLowerCase().trim();

    // Account Linking Policy implementation
    let user = await prisma.mobileUser.findUnique({
      where: { email: emailNormalized },
    });

    if (user) {
      // Existing user found. Link the account if not already linked.
      if (!user.googleId) {
        user = await prisma.mobileUser.update({
          where: { id: user.id },
          data: {
            googleId,
            authProvider: user.authProvider === "EMAIL" ? "EMAIL_AND_GOOGLE" : user.authProvider,
            profileImage: user.profileImage || picture,
            emailVerified: true,
          },
        });
      }
    } else {
      // Create new user for Google login
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
      return NextResponse.json({ error: "Account is suspended." }, { status: 403 });
    }

    // Update login tracking
    await prisma.mobileUser.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        loginCount: { increment: 1 },
      },
    });

    // Create session
    const { rawToken, tokenHash } = generateMobileSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.mobileSession.create({
      data: {
        // Stamped so the admin lists can tell an app session from a
        // browser one without inferring it from a missing value.
        platform: "APP",
        tokenHash,
        userId: user.id,
        expiresAt,
      },
    });

    return NextResponse.json({
      token: rawToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        authProvider: user.authProvider,
        profileImage: user.profileImage,
      },
    });
  } catch (error) {
    console.error("Mobile Google Auth Error:", error);
    return NextResponse.json({ error: "Google authentication failed. Please try again." }, { status: 401 });
  }
}
