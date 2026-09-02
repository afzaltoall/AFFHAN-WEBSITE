import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateMobileSessionToken } from "@/lib/mobile-auth";
import { normalisePhone, otpMatches, OTP_MAX_ATTEMPTS } from "@/lib/mobile-otp";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phone, code } = body;

    if (!phone || !code) {
      return NextResponse.json({ error: "Phone number and code are required." }, { status: 400 });
    }

    const normPhone = normalisePhone(phone);
    if (!normPhone) {
      return NextResponse.json(
        { error: "Invalid phone number format." },
        { status: 400 }
      );
    }

    // 1. Find the latest unconsumed OTP for this phone that hasn't expired
    const otpRecord = await prisma.mobilePhoneOtp.findFirst({
      where: {
        phone: normPhone,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRecord) {
      return NextResponse.json(
        { error: "Invalid or expired code. Please request a new one." },
        { status: 400 }
      );
    }

    if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: "Too many failed attempts. Please request a new code." },
        { status: 429 }
      );
    }

    // 2. Verify the code.
    // codeHash became nullable when phone sign-in moved to Twilio Verify, which
    // holds the code itself — rows written since then are send records with no
    // hash to compare against. Such a row can only have come from the Verify
    // flow, so it is not this endpoint's to approve.
    if (!otpRecord.codeHash) {
      return NextResponse.json(
        { error: "Invalid or expired code. Please request a new one." },
        { status: 400 }
      );
    }

    if (!otpMatches(code, otpRecord.codeHash)) {
      // Increment attempts
      await prisma.mobilePhoneOtp.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      return NextResponse.json({ error: "Incorrect code." }, { status: 400 });
    }

    // 3. Mark OTP as consumed
    await prisma.mobilePhoneOtp.update({
      where: { id: otpRecord.id },
      data: { consumedAt: new Date() },
    });

    // 4. Find or create the mobile user
    let user = await prisma.mobileUser.findUnique({
      where: { phone: normPhone },
    });

    if (!user) {
      user = await prisma.mobileUser.create({
        data: {
          phone: normPhone,
          phoneVerified: true,
          name: "User", // Can be updated later
          authProvider: "PHONE",
        },
      });
    } else if (!user.phoneVerified) {
      user = await prisma.mobileUser.update({
        where: { id: user.id },
        data: { phoneVerified: true },
      });
    }

    // 5. Update last login and create session
    await prisma.mobileUser.update({
      where: { id: user.id },
      data: {
        loginCount: { increment: 1 },
        lastLoginAt: new Date(),
      },
    });

    // We'll also return a session row just to match what happens for google/email.
    const { rawToken, tokenHash } = generateMobileSessionToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const session = await prisma.mobileSession.create({
      data: {
        // Stamped so the admin lists can tell an app session from a
        // browser one without inferring it from a missing value.
        platform: "APP",
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return NextResponse.json({
      message: "Signed in successfully",
      token: rawToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        profileImage: user.profileImage,
        authProvider: user.authProvider,
      },
    });

  } catch (err: any) {
    console.error("[OTP Verify Error]", err);
    return NextResponse.json(
      { error: "Failed to verify code. Please try again." },
      { status: 500 }
    );
  }
}
