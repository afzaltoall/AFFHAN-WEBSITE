import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateMobileSessionToken } from "@/lib/mobile-auth";
import { checkLoginRateLimit } from "@/lib/rate-limit"; // Assuming we want to rate limit mobile login too!

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // 1. Rate limiting (reused from Phase 2)
    const rateLimit = await checkLoginRateLimit(request as any);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": Math.ceil(((rateLimit.reset || Date.now()) - Date.now()) / 1000).toString() }
        }
      );
    }

    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const emailNormalized = email.toLowerCase().trim();

    const user = await prisma.mobileUser.findUnique({
      where: { email: emailNormalized },
    });

    // Generic error message for both cases
    const authFailedResponse = NextResponse.json({ error: "Invalid email or password." }, { status: 401 });

    if (!user) {
      return authFailedResponse;
    }

    if (!user.passwordHash) {
      // User registered with Google and has no password set
      return authFailedResponse;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return authFailedResponse;
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
      },
    });
  } catch (error) {
    console.error("Mobile Login Error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
