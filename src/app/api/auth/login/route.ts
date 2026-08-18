import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signSession, SESSION_COOKIE, cookieOptions } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const normEmail = String(email).trim().toLowerCase();

    // 1. Look up the admin in the database.
    let admin = await prisma.adminUser.findUnique({ where: { email: normEmail } });

    // 2. Bootstrap (one time): if there is no admin in the DB yet, fall back to
    //    the .env ADMIN_EMAIL/ADMIN_PASSWORD and create the first DB record from
    //    them (hashed). After this, the password lives in the DB and can be
    //    changed from the UI — .env is never read again.
    if (!admin) {
      const count = await prisma.adminUser.count();
      const envEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      const envPassword = process.env.ADMIN_PASSWORD;
      if (count === 0 && envEmail && envPassword && normEmail === envEmail && password === envPassword) {
        const passwordHash = await bcrypt.hash(envPassword, 10);
        admin = await prisma.adminUser.create({
          data: { email: envEmail, passwordHash, name: "Admin" },
        });
      }
    }

    if (!admin) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    const user = {
      id: admin.id,
      email: admin.email,
      name: admin.name ?? "Admin",
      role: "admin",
      image: admin.image ?? null,
    };

    const token = signSession(user);
    const res = NextResponse.json({ user });
    res.cookies.set(SESSION_COOKIE, token, cookieOptions);
    return res;
  } catch (err) {
    console.error("login error", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
