import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateMobileSessionToken, SESSION_DAYS } from "@/lib/mobile-auth";
import { checkCustomerLoginRateLimit } from "@/lib/rate-limit";
import { beginLoginAttempt, clearLoginFailures, customerLoginKey, verifyPasswordOrNothing } from "@/lib/password";
import { lockedMessage } from "@/lib/login-lockout";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    // 1. Per connection, on one count with the website's sign-in. Fails open
    // (lib/limit-policy.ts): the database lockout below always holds.
    const rateLimit = await checkCustomerLoginRateLimit(request);
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

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const emailNormalized = email.toLowerCase().trim();

    // The website's lockout, on the same count: the app and the site sign in
    // the same accounts (lib/password.ts; security audit 2026-10-08, H5).
    const gate = await beginLoginAttempt(customerLoginKey(emailNormalized));
    if (gate.locked) {
      return NextResponse.json(
        { error: lockedMessage(gate.retryAfterMs), reason: "locked" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) } }
      );
    }

    const user = await prisma.mobileUser.findUnique({
      where: { email: emailNormalized },
    });

    // One answer, after the same bcrypt work, for no account, an account with
    // no password (Google only), and a wrong password.
    const isValid = await verifyPasswordOrNothing(password, user?.passwordHash);
    if (!user || !isValid) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    await clearLoginFailures(customerLoginKey(emailNormalized));

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
    expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

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
