import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMobileSession } from "@/lib/mobile-auth";
import { publicUser } from "@/lib/web-session";
import { recordAccountChanges } from "@/lib/account-audit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 80;

/**
 * Edit your own name and email.
 *
 * The session cookie decides whose record this is — the same verifyMobileSession
 * /me uses. Nothing about identity is read from the body, so a request cannot
 * name a different user to edit.
 *
 * Phone is not editable here on purpose. Changing it means proving the new
 * number with a fresh OTP, and a profile PATCH that could silently move an
 * account onto an unverified number would be a way to take someone else's.
 * That lives at /api/web/auth/add-phone instead.
 */
export async function PATCH(request: Request) {
  try {
    const user = await verifyMobileSession(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = await request.json().catch(() => ({}));

    const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
    const rawEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!firstName) {
      return NextResponse.json({ error: "Enter your first name." }, { status: 400 });
    }
    if (firstName.length > NAME_MAX || lastName.length > NAME_MAX) {
      return NextResponse.json({ error: "That name is too long." }, { status: 400 });
    }
    if (rawEmail && !EMAIL_RE.test(rawEmail)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    // Email is unique across accounts. Claiming one that belongs to somebody
    // else has to fail here with something readable, rather than surfacing as a
    // Prisma constraint error.
    if (rawEmail && rawEmail !== user.email) {
      const taken = await prisma.mobileUser.findUnique({
        where: { email: rawEmail },
        select: { id: true },
      });
      if (taken && taken.id !== user.id) {
        return NextResponse.json(
          { error: "That email is already used by another account." },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.mobileUser.update({
      where: { id: user.id },
      data: {
        firstName,
        lastName: lastName || null,
        name: [firstName, lastName].filter(Boolean).join(" "),
        email: rawEmail || null,
        // Changing the address means the new one has not been confirmed, so the
        // verified flag cannot simply carry over from the old one.
        ...(rawEmail && rawEmail !== user.email ? { emailVerified: false } : {}),
      },
    });

    // Logged after the update, so nothing is recorded that did not happen.
    await recordAccountChanges(user.id, "WEB", [
      { field: "name", from: user.name, to: updated.name },
      { field: "email", from: user.email, to: updated.email },
    ]);

    return NextResponse.json({ success: true, user: publicUser(updated) });
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json({ error: "Could not save your details." }, { status: 500 });
  }
}
