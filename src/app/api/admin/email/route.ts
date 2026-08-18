import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, signSession, SESSION_COOKIE, cookieOptions } from "@/lib/session";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Change the admin email. Requires the current password (bcrypt) to confirm
// identity, then re-issues the session cookie so it carries the new email —
// otherwise later profile updates would look up the old email and fail.
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { newEmail, currentPassword } = await request.json();
    if (!newEmail || !currentPassword) {
      return NextResponse.json({ error: "New email and current password are required." }, { status: 400 });
    }
    const normNew = String(newEmail).trim().toLowerCase();
    if (!EMAIL_RE.test(normNew)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

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

    if (normNew === admin.email) {
      return NextResponse.json({ error: "That is already your email." }, { status: 400 });
    }

    // Single admin today, but guard against a taken email regardless.
    const taken = await prisma.adminUser.findUnique({ where: { email: normNew } });
    if (taken) {
      return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
    }

    const updated = await prisma.adminUser.update({
      where: { id: admin.id },
      data: { email: normNew },
    });

    const newUser = {
      id: updated.id,
      email: updated.email,
      name: updated.name ?? "Admin",
      role: "admin",
      image: updated.image ?? null,
    };
    const res = NextResponse.json({ user: newUser });
    res.cookies.set(SESSION_COOKIE, signSession(newUser), cookieOptions);
    return res;
  } catch (err) {
    console.error("email change error", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
