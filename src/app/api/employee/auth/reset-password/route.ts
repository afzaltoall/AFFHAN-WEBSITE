import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkPasswordResetRateLimit } from "@/lib/rate-limit";
import { readResetToken } from "@/lib/reset-token";
import { consumeAllEmailOtps, spendResetToken } from "@/lib/email-otp";
import { checkPasswordStrength, clearLoginFailures, hashPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

/**
 * Set a new staff password.
 *
 * The customer route's shape, against the Employee table, with two additions
 * that matter for staff:
 *
 *   - tokenVersion is bumped, which invalidates every session cookie already
 *     issued to this employee. Resetting a password has to end the sessions
 *     that password opened, otherwise a reset prompted by "someone else may be
 *     in my account" leaves them in it.
 *   - the failed-login counter is cleared, so somebody who reset precisely
 *     because they were locked out can sign in immediately.
 *
 * The address comes out of the signed token, never out of the body, and the
 * token must be an employee one: readResetToken refuses a customer token here.
 */
export async function POST(request: NextRequest) {
  try {
    const limit = await checkPasswordResetRateLimit(request);
    if (!limit.success) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again in a few minutes." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    const claims = readResetToken(body?.resetToken, "employee");
    if (!claims) {
      return NextResponse.json({ error: "That took too long. Ask for a new code." }, { status: 401 });
    }
    const { email, otpId } = claims;

    const claimed = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (claimed && claimed !== email) {
      return NextResponse.json({ error: "That took too long. Ask for a new code." }, { status: 401 });
    }

    const strength = checkPasswordStrength(newPassword);
    if (!strength.ok) {
      return NextResponse.json({ error: strength.error }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({
      where: { email },
      select: { id: true, isActive: true },
    });
    if (!employee || !employee.isActive) {
      return NextResponse.json({ error: "That took too long. Ask for a new code." }, { status: 401 });
    }

    // Spent before the password is written, and conditionally, so the same
    // token cannot be replayed and two requests racing cannot both win.
    if (!(await spendResetToken(otpId, email, "EMPLOYEE_PASSWORD_RESET"))) {
      return NextResponse.json(
        { error: "That code has already been used. Ask for a new one." },
        { status: 401 }
      );
    }

    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        tokenVersion: { increment: 1 },
      },
    });

    await consumeAllEmailOtps(email, "EMPLOYEE_PASSWORD_RESET");
    await clearLoginFailures(email);

    return NextResponse.json({ success: true });
  } catch (error) {
    // The name only: a Prisma failure prints its arguments, and one of them
    // here is the new password's hash.
    console.error("Employee reset password error:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
