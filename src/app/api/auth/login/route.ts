import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signSession, SESSION_COOKIE, adminCookieOptions } from "@/lib/session";
import { checkLoginRateLimit, getClientIp, limiterUnavailable } from "@/lib/rate-limit";
import { adminLoginKey, beginLoginAttempt, clearLoginFailures, verifyPasswordOrNothing } from "@/lib/password";
import { waitPhrase } from "@/lib/login-lockout";
import { checkTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { email, password, turnstileToken } = await request.json();

    // 1. Validate CAPTCHA (Turnstile) first. In production a missing secret
    // refuses, where it used to skip the check (lib/turnstile.ts).
    const human = await checkTurnstile(turnstileToken, getClientIp(request));
    if (!human.ok) {
      return NextResponse.json({ error: human.error }, { status: human.status });
    }

    // 2. Check rate limit
    const rateLimit = await checkLoginRateLimit(request);
    if (rateLimit.unavailable) return limiterUnavailable("Sign-in");
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": Math.ceil(((rateLimit.reset || Date.now()) - Date.now()) / 1000).toString() }
        }
      );
    }

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const normEmail = email.trim().toLowerCase();

    // Five wrong passwords lock this address for fifteen minutes, and each five
    // after that for twice as long (lib/login-lockout.ts). Kept in the
    // database, so it holds whether or not Upstash is configured (security
    // audit 2026-10-08, H5).
    const gate = await beginLoginAttempt(adminLoginKey(normEmail));
    if (gate.locked) {
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${waitPhrase(gate.retryAfterMs)}.` },
        { status: 429, headers: { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) } }
      );
    }

    // One answer, after the same bcrypt work, for an address that is not an
    // admin's and for a wrong password.
    const admin = await prisma.adminUser.findUnique({ where: { email: normEmail } });
    const ok = await verifyPasswordOrNothing(password, admin?.passwordHash);
    if (!admin || !ok) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    await clearLoginFailures(adminLoginKey(normEmail));

    const user = {
      id: admin.id,
      email: admin.email,
      name: admin.name ?? "Admin",
      role: "admin",
      image: admin.image ?? null,
    };

    // Signed against the account's current version, which a password change
    // moves on, ending every cookie signed before it (lib/session.ts).
    const token = signSession({ ...user, tokenVersion: admin.tokenVersion });
    const res = NextResponse.json({ user });
    // Written to lapse with the idle window rather than outlive it by a
    // month: the console slides it forward while somebody is working.
    res.cookies.set(SESSION_COOKIE, token, adminCookieOptions);
    return res;
  } catch (err) {
    console.error("login error", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
