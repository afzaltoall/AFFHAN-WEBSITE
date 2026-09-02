import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateMobileSessionToken } from "@/lib/mobile-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Name, email, and password are required." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const emailNormalized = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await prisma.mobileUser.findUnique({
      where: { email: emailNormalized },
    });

    if (existingUser) {
      return NextResponse.json({ error: "Email is already in use." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.mobileUser.create({
      data: {
        name: name.trim(),
        email: emailNormalized,
        passwordHash,
        authProvider: "EMAIL",
        lastLoginAt: new Date(),
        loginCount: 1,
      },
    });

    // Create session
    const { rawToken, tokenHash } = generateMobileSessionToken();
    
    // Session valid for 30 days
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
    console.error("Mobile Register Error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
