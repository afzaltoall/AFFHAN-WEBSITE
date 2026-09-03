import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { checkPasswordResetRateLimit } from "@/lib/rate-limit";
import { readResetToken } from "@/lib/reset-token";
import { consumeAllEmailOtps, spendResetToken } from "@/lib/email-otp";
import { recordAccountChanges } from "@/lib/account-audit";

export const dynamic = "force-dynamic";

/**
 * Set the new password.
 *
 * The address comes out of the signed token, never out of the body — otherwise
 * anyone who could get a code for their own address could name somebody else's
 * here. The `email` field is still accepted so the client can send back what it
 * has, but it is only checked for agreement, never trusted.
 *
 * Twelve rounds of bcrypt, matching /api/mobile/auth/register. The two hashes
 * have to be verifiable by the same login route, so this is not a place to
 * pick a different cost.
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

    const claims = readResetToken(body?.resetToken);
    if (!claims) {
      return NextResponse.json(
        { error: "That took too long. Ask for a new code." },
        { status: 401 }
      );
    }
    const { email, otpId } = claims;

    // If the client sent an address too, it has to be the one the token
    // vouches for. A mismatch means a stale form, not an attack we can act on,
    // but proceeding would set the password on an account the person is no
    // longer looking at.
    const claimed = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (claimed && claimed !== email) {
      return NextResponse.json(
        { error: "That took too long. Ask for a new code." },
        { status: 401 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "Use at least 8 characters." },
        { status: 400 }
      );
    }
    if (newPassword.length > 200) {
      return NextResponse.json({ error: "That password is too long." }, { status: 400 });
    }

    const user = await prisma.mobileUser.findUnique({
      where: { email },
      select: { id: true, accountStatus: true },
    });
    if (!user || user.accountStatus !== "ACTIVE") {
      return NextResponse.json(
        { error: "That took too long. Ask for a new code." },
        { status: 401 }
      );
    }

    // Spend the token BEFORE the password is written. The signature alone
    // carries no state, so without this the same token worked over and over
    // for its full ten minutes — measured, not theorised. Claiming the row
    // first also means two requests racing cannot both go through: the loser
    // matches no rows and is turned away without having changed anything.
    if (!(await spendResetToken(otpId, email))) {
      return NextResponse.json(
        { error: "That code has already been used. Ask for a new one." },
        { status: 401 }
      );
    }

    await prisma.mobileUser.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 12) },
    });

    // Any other live code for this address is now spent. Without this, a
    // second code requested during the same window would still work after the
    // password had already been changed.
    await consumeAllEmailOtps(email, "PASSWORD_RESET");

    // Records that it happened, and nothing about what it became — see
    // lib/account-audit.ts.
    await recordAccountChanges(user.id, "WEB", [{ field: "password" }]);

    return NextResponse.json({ success: true });
  } catch (error) {
    // The error's name only. A Prisma failure prints the call that failed,
    // arguments included — and the argument here is the new password's hash.
    // The other two routes in this flow log the whole error because neither
    // ever holds credential material.
    console.error("Reset password error:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
