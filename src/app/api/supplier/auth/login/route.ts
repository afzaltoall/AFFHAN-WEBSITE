import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { beginLoginAttempt, clearLoginFailures, supplierLoginKey, verifyPasswordOrNothing } from "@/lib/password";
import { lockedMessage } from "@/lib/login-lockout";
import { checkTurnstile } from "@/lib/turnstile";
import { checkSupplierLoginRateLimit, getClientIp, limitReached } from "@/lib/rate-limit";
import { setSupplierCookie } from "@/lib/supplier-session";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One sentence for every way this can fail, as the customer sign-in has. */
const WRONG = "Incorrect email or password.";

/**
 * Sign a supplier in: the customer sign-in's shape (app/api/web/auth/login-password) against the
 * SupplierAccount table, with a lockout count of its own (supplierLoginKey), so a supplier who is also a
 * customer is never locked out of one by mistakes made at the other.
 *
 * No account, a blocked account and a wrong password are one answer after the same bcrypt work, so this
 * cannot be used to ask which addresses are suppliers of ours.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // Turnstile first, before any count or lookup.
    const human = await checkTurnstile(body?.turnstileToken, getClientIp(request));
    if (!human.ok) return NextResponse.json({ error: human.error }, { status: human.status });

    const perIp = await checkSupplierLoginRateLimit(request);
    if (!perIp.success) return limitReached("There have been a lot of sign-in attempts from this connection.", perIp);

    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || !EMAIL_RE.test(email) || !password) {
      return NextResponse.json({ error: WRONG }, { status: 401 });
    }

    // Per address, in the database (lib/login-lockout.ts): five failures lock it for fifteen minutes, each
    // five after that for twice as long. Checked before the password is read.
    const key = supplierLoginKey(email);
    const gate = await beginLoginAttempt(key);
    if (gate.locked) {
      return NextResponse.json(
        { error: lockedMessage(gate.retryAfterMs), reason: "locked" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) } }
      );
    }

    const account = await prisma.supplierAccount.findUnique({
      where: { email },
      select: { id: true, passwordHash: true, status: true, tokenVersion: true },
    });
    const matches = await verifyPasswordOrNothing(password, account?.passwordHash);
    if (!account || account.status !== "ACTIVE" || !matches) {
      return NextResponse.json({ error: WRONG }, { status: 401 });
    }

    await clearLoginFailures(key);
    await prisma.supplierAccount.update({ where: { id: account.id }, data: { lastLoginAt: new Date() } });

    return setSupplierCookie(NextResponse.json({ success: true }), account);
  } catch (error) {
    console.error("Supplier login error:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
