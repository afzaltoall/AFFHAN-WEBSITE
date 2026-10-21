import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkTurnstile } from "@/lib/turnstile";
import { checkSupplierRegisterRateLimit, getClientIp, limitReached } from "@/lib/rate-limit";
import { checkPasswordStrength, hashPassword } from "@/lib/password";
import { readSignup } from "@/lib/supplier-offer";
import { setSupplierCookie } from "@/lib/supplier-session";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAKEN = "A supplier account with this email already exists. Sign in instead.";

/**
 * Create a supplier account, and sign it in (the supplier portal, 2026-10-21).
 *
 * The customer sign-up's four fields, name, email, mobile and password (the
 * owner: "same as user login style"), in a table of its own: a supplier
 * account is never a customer's, nor the other way round. The company, the
 * WeChat ID and the address are asked when the supplier applies for a
 * product. Nothing waits for approval: the owner chose "apply right away".
 *
 * Open to anyone, so Turnstile comes first and a per-connection limit second,
 * as on the customer sign-in. An address that already has an account is told
 * so: someone registering needs to know to sign in instead, which is the
 * customer sign-up's trade too.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // Turnstile first, before the limit is spent or anything read.
    const human = await checkTurnstile(body?.turnstileToken, getClientIp(request));
    if (!human.ok) return NextResponse.json({ error: human.error }, { status: human.status });

    const limit = await checkSupplierRegisterRateLimit(request);
    if (!limit.success) return limitReached("There have been a lot of registrations from this connection.", limit);

    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) return NextResponse.json({ error: "Enter your email address.", field: "email" }, { status: 400 });
    if (email.length > 254 || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address.", field: "email" }, { status: 400 });
    }

    const password = typeof body?.password === "string" ? body.password : "";
    const strength = checkPasswordStrength(password);
    if (!strength.ok) return NextResponse.json({ error: strength.error, field: "password" }, { status: 400 });

    const who = readSignup(body && typeof body === "object" ? body : {});
    if (!who.ok) return NextResponse.json({ error: who.error, field: who.field }, { status: 400 });

    // Asked first for the sentence; the unique index below is the guarantee when two arrive at once.
    const taken = await prisma.supplierAccount.findUnique({ where: { email }, select: { id: true } });
    if (taken) return NextResponse.json({ error: TAKEN, field: "email" }, { status: 409 });

    let account: { id: string; tokenVersion: number };
    try {
      account = await prisma.supplierAccount.create({
        data: { email, passwordHash: await hashPassword(password), ...who.value, lastLoginAt: new Date() },
        select: { id: true, tokenVersion: true },
      });
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") {
        return NextResponse.json({ error: TAKEN, field: "email" }, { status: 409 });
      }
      throw e;
    }

    // Signed in straight away: registering and then signing in is typing the same password twice.
    return setSupplierCookie(NextResponse.json({ success: true }), account);
  } catch (error) {
    // The name only: a Prisma failure prints its arguments, and one of them is a password hash.
    console.error("Supplier register error:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
