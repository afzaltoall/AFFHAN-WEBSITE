import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkSupplierVerifyRateLimit, limitReached } from "@/lib/rate-limit";
import { checkPasswordStrength, hashPassword } from "@/lib/password";
import { readSignup } from "@/lib/supplier-offer";
import { checkEmailOtp } from "@/lib/email-otp";
import { setSupplierCookie } from "@/lib/supplier-session";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAKEN = "A supplier account with this email already exists. Sign in instead.";

/**
 * Creating a supplier account, step two: the code from the email, and the account opens, signed in (the owner,
 * 2026-10-23: "email check at sign-up"). The only place a supplier account is created.
 *
 * The details come again with the code, from the form the supplier filled in step one (register), and are
 * checked again before the code is: a code is spent when it is accepted, so a detail that fails afterwards
 * would cost the supplier their code. Then the code, under its own purpose (SUPPLIER_SIGNUP, never a reset's),
 * with lib/email-otp.ts's ceiling of wrong tries; then the account.
 *
 * No Turnstile, as at the reset's code step: the code is the proof, and asking for one (step one) is what
 * Turnstile guards. A per-connection limit keeps a guesser to a few addresses' worth of tries.
 */
export async function POST(request: NextRequest) {
  try {
    const limit = await checkSupplierVerifyRateLimit(request);
    if (!limit.success) return limitReached("There have been a lot of attempts from this connection.", limit);

    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address.", field: "email" }, { status: 400 });
    }
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!/^\d{4,10}$/.test(code)) {
      return NextResponse.json({ error: "Enter the six-digit code we emailed you.", field: "code" }, { status: 400 });
    }

    const password = typeof body?.password === "string" ? body.password : "";
    const strength = checkPasswordStrength(password);
    if (!strength.ok) return NextResponse.json({ error: strength.error, field: "password" }, { status: 400 });

    const who = readSignup(body && typeof body === "object" ? body : {});
    if (!who.ok) return NextResponse.json({ error: who.error, field: who.field }, { status: 400 });

    // Before the code, so a code is not spent on an address that is already an account.
    const taken = await prisma.supplierAccount.findUnique({ where: { email }, select: { id: true } });
    if (taken) return NextResponse.json({ error: TAKEN, field: "email" }, { status: 409 });

    const result = await checkEmailOtp(email, "SUPPLIER_SIGNUP", code);
    if (!result.ok) {
      if (result.reason === "too_many_attempts") {
        return NextResponse.json({ error: "Too many wrong codes. Ask for a new one.", field: "code" }, { status: 429 });
      }
      if (result.reason === "wrong_code") {
        return NextResponse.json({ error: "That code isn't right. Check the email and try again.", field: "code" }, { status: 400 });
      }
      return NextResponse.json({ error: "That code has expired. Ask for a new one.", field: "code" }, { status: 400 });
    }

    let account: { id: string; tokenVersion: number };
    try {
      account = await prisma.supplierAccount.create({
        data: { email, passwordHash: await hashPassword(password), ...who.value, lastLoginAt: new Date() },
        select: { id: true, tokenVersion: true },
      });
    } catch (e) {
      // Two arriving at once: the unique index decides.
      if ((e as { code?: string })?.code === "P2002") {
        return NextResponse.json({ error: TAKEN, field: "email" }, { status: 409 });
      }
      throw e;
    }

    // Signed in straight away: registering and then signing in is typing the same password twice.
    return setSupplierCookie(NextResponse.json({ success: true }), account);
  } catch (error) {
    // The name only: a Prisma failure prints its arguments, and one of them is a password hash.
    console.error("Supplier register verify error:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
