import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// Change the admin password. Verifies the current password against the bcrypt
// hash in the DB, then stores a new hash. The .env password is never touched.
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
    if (String(newPassword).length < 6) {
      return NextResponse.json({ error: "New password must be at least 6 characters." }, { status: 400 });
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

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("password change error", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
