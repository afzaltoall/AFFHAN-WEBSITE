import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMobileSession } from "@/lib/mobile-auth";
import { checkPasswordStrength, hashPassword, verifyPassword } from "@/lib/password";
import { recordAccountChanges } from "@/lib/account-audit";

export const dynamic = "force-dynamic";

/**
 * Set a password, or change the one already there.
 *
 * The session decides whose account this is — nothing in the body names a
 * user. Which of the two operations it is depends on the account, not on what
 * the caller asks for: an account that already has a password must prove the
 * old one, and an account that has none cannot, because there is nothing to
 * prove.
 *
 * That second case is the important one. Every real account on the site today
 * signed in with Google or a phone code and has no password at all; without a
 * way to add one from inside the account, email sign-in would only ever be
 * available to people who join after today. Being signed in is the proof here,
 * and the session behind it was opened by Google or by a code sent to their
 * own number.
 */
export async function POST(request: Request) {
  try {
    const user = await verifyMobileSession(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
    const currentPassword =
      typeof body?.currentPassword === "string" ? body.currentPassword : "";

    const strength = checkPasswordStrength(newPassword);
    if (!strength.ok) {
      return NextResponse.json({ error: strength.error }, { status: 400 });
    }

    const hadPassword = Boolean(user.passwordHash);

    if (hadPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Enter your current password." },
          { status: 400 }
        );
      }
      if (!(await verifyPassword(currentPassword, user.passwordHash!))) {
        // Not throttled here: this is behind a session, so an attacker
        // guessing would already have the account.
        return NextResponse.json(
          { error: "That is not your current password." },
          { status: 401 }
        );
      }
      if (await verifyPassword(newPassword, user.passwordHash!)) {
        return NextResponse.json(
          { error: "That is the password you already have." },
          { status: 400 }
        );
      }
    }

    await prisma.mobileUser.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        // Adding a password adds a way in, and the account page reads this
        // string to say how someone signs in.
        ...(user.authProvider.includes("EMAIL")
          ? {}
          : { authProvider: `${user.authProvider}_AND_EMAIL` }),
      },
    });

    // Records that it happened and nothing about what it became.
    await recordAccountChanges(user.id, "WEB", [{ field: "password" }]);

    return NextResponse.json({ success: true, hadPassword });
  } catch (error) {
    // The name only: a Prisma failure prints its arguments, and the argument
    // here is the new hash.
    console.error("Set password error:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Could not save your password." }, { status: 500 });
  }
}
