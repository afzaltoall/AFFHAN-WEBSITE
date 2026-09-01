import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signSession, SESSION_COOKIE, cookieOptions } from "@/lib/session";
import { checkLoginRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { email, password, turnstileToken } = await request.json();
    
    // 1. Validate CAPTCHA (Turnstile) first
    if (!turnstileToken) {
      return NextResponse.json({ error: "Please complete the security check." }, { status: 400 });
    }
    
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (turnstileSecret) {
      const formData = new URLSearchParams();
      formData.append("secret", turnstileSecret);
      formData.append("response", turnstileToken);
      // Optional: you can also pass remoteip here if needed, but not strictly required by CF unless enabled
      
      const cfRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: formData,
      });
      const cfData = await cfRes.json();
      if (!cfData.success) {
        return NextResponse.json({ error: "Security check failed. Please try again." }, { status: 403 });
      }
    } else {
      console.warn("TURNSTILE_SECRET_KEY is missing. Skipping CAPTCHA validation.");
    }

    // 2. Check rate limit
    const rateLimit = await checkLoginRateLimit(request as any);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { 
          status: 429, 
          headers: { "Retry-After": Math.ceil(((rateLimit.reset || Date.now()) - Date.now()) / 1000).toString() }
        }
      );
    }

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const normEmail = String(email).trim().toLowerCase();

    const admin = await prisma.adminUser.findUnique({ where: { email: normEmail } });

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
