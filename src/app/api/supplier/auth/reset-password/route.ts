import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkPasswordResetRateLimit, limitReached } from "@/lib/rate-limit";
import { readResetToken } from "@/lib/reset-token";
import { consumeAllEmailOtps, spendResetToken } from "@/lib/email-otp";
import { checkPasswordStrength, clearLoginFailures, hashPassword, supplierLoginKey } from "@/lib/password";

export const dynamic = "force-dynamic";

const STALE = "That took too long. Ask for a new code.";

/**
 * Set a supplier's new password: the staff route's shape (app/api/employee/auth/reset-password).
 *
 * The address comes out of the signed token, which must be a supplier one, never out of the body. The token is
 * spent before the password is written, so it works once. tokenVersion is bumped, which ends every session the
 * old password opened, and the sign-in lock is lifted, since the lock's own message sends people here.
 */
export async function POST(request: NextRequest) {
  try {
    const limit = await checkPasswordResetRateLimit(request);
    if (!limit.success) return limitReached("There have been a lot of password-reset requests from this connection.", limit);

    const body = await request.json().catch(() => ({}));
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    const claims = readResetToken(body?.resetToken, "supplier");
    if (!claims) return NextResponse.json({ error: STALE }, { status: 401 });
    const { email, otpId } = claims;

    const claimed = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (claimed && claimed !== email) return NextResponse.json({ error: STALE }, { status: 401 });

    const strength = checkPasswordStrength(newPassword);
    if (!strength.ok) return NextResponse.json({ error: strength.error }, { status: 400 });

    const account = await prisma.supplierAccount.findUnique({ where: { email }, select: { id: true, status: true } });
    if (!account || account.status !== "ACTIVE") return NextResponse.json({ error: STALE }, { status: 401 });

    if (!(await spendResetToken(otpId, email, "SUPPLIER_PASSWORD_RESET"))) {
      return NextResponse.json({ error: "That code has already been used. Ask for a new one." }, { status: 401 });
    }

    await prisma.supplierAccount.update({
      where: { id: account.id },
      data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 } },
    });

    await consumeAllEmailOtps(email, "SUPPLIER_PASSWORD_RESET");
    await clearLoginFailures(supplierLoginKey(email));

    return NextResponse.json({ success: true });
  } catch (error) {
    // The name only: a Prisma failure prints its arguments, and one of them is the new password's hash.
    console.error("Supplier reset password error:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
