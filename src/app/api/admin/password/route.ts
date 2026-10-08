import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { adminCookieOptions, getCurrentUser, SESSION_COOKIE, signSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The console's sign-in guards everything in it, so it is held to more than a customer's. */
const ADMIN_PASSWORD_MIN = 12;

// Change the admin password. Verifies the current password against the bcrypt
// hash in the DB, then stores a new hash. The .env password is never touched.
//
// It also moves the account's tokenVersion on, which ends every admin cookie
// signed before it: a password changed because it leaked has to shut out
// whoever used it, not only the next sign-in (security audit 2026-10-08, M4).
// This browser gets a cookie on the new version, so it stays signed in.
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { currentPassword, newPassword } = await request.json();
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current and new password are required." }, { status: 400 });
    }
    if (String(newPassword).length < ADMIN_PASSWORD_MIN) {
      return NextResponse.json(
        { error: `New password must be at least ${ADMIN_PASSWORD_MIN} characters.` },
        { status: 400 },
      );
    }
    if (currentPassword === newPassword) {
      return NextResponse.json({ error: "New password must be different from the current one." }, { status: 400 });
    }

    // Look up by email — it's stable across sessions (older sessions may carry a
    // legacy id, but the email always matches the DB record). Normalised to
    // lower-case to match how the login bootstrap stores it.
    const admin = await prisma.adminUser.findUnique({
      where: { email: user.email.trim().toLowerCase() },
    });
    if (!admin) {
      return NextResponse.json(
        { error: "Please sign out and sign in once, then try again." },
        { status: 404 },
      );
    }

    const ok = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });
    }

    // Twelve rounds, as the customer passwords have (lib/password.ts).
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const updated = await prisma.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(
      SESSION_COOKIE,
      signSession({
        id: updated.id,
        email: updated.email,
        name: updated.name ?? "Admin",
        role: "admin",
        image: updated.image ?? null,
        tokenVersion: updated.tokenVersion,
      }),
      adminCookieOptions,
    );
    return res;
  } catch (err) {
    console.error("password change error", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
