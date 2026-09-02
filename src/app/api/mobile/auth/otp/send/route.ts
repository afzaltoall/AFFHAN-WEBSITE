import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import {
  normalisePhone,
  generateOtp,
  hashOtp,
  OTP_TTL_MS,
  OTP_RESEND_COOLDOWN_MS,
  sendOtpSms,
  maskPhone,
} from "@/lib/mobile-otp";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phone } = body;

    if (!phone) {
      return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
    }

    const normPhone = normalisePhone(phone);
    if (!normPhone) {
      return NextResponse.json(
        { error: "Invalid phone number format. Please enter a valid Indian mobile number." },
        { status: 400 }
      );
    }

    // 1. Rate Limiting: Prevent spamming a phone number.
    // Check the latest OTP for this phone.
    const latestOtp = await prisma.mobilePhoneOtp.findFirst({
      where: { phone: normPhone },
      orderBy: { createdAt: "desc" },
    });

    if (latestOtp) {
      const nowMs = Date.now();
      const createdMs = latestOtp.createdAt.getTime();
      const diffMs = nowMs - createdMs;

      if (diffMs < OTP_RESEND_COOLDOWN_MS) {
        const remaining = Math.ceil((OTP_RESEND_COOLDOWN_MS - diffMs) / 1000);
        return NextResponse.json(
          { error: `Please wait ${remaining}s before requesting a new code.` },
          { status: 429 }
        );
      }
    }

    // 2. Generate and Store OTP
    const code = generateOtp();
    const codeHash = hashOtp(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await prisma.mobilePhoneOtp.create({
      data: {
        id: crypto.randomUUID(),
        phone: normPhone,
        codeHash,
        expiresAt,
      },
    });

    // 3. Send SMS
    // This will throw if the provider is missing or unimplemented.
    const smsResult = await sendOtpSms(normPhone, code);

    return NextResponse.json({
      success: true,
      delivered: true,
      provider: smsResult.provider,
      message: `OTP sent to ${maskPhone(normPhone)}`,
    });

  } catch (err: any) {
    if (err instanceof Error && err.message.includes("SMS provider not configured")) {
      return NextResponse.json(
        { error: err.message },
        { status: 501 } // Not Implemented
      );
    }

    console.error("[OTP Send Error]", err);
    return NextResponse.json(
      { error: "Failed to send OTP. Please try again." },
      { status: 500 }
    );
  }
}
