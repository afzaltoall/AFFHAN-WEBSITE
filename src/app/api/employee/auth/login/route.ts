import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkLoginRateLimit } from "@/lib/rate-limit";
import {
  clearLoginFailures,
  countRecentLoginFailures,
  LOGIN_MAX_FAILURES,
  recordLoginFailure,
  verifyPassword,
} from "@/lib/password";
import { cookieOptions, SESSION_COOKIE } from "@/lib/session";
import { EMPLOYEE_IDLE_MS, signEmployeeSession } from "@/lib/employee-session";

export const dynamic = "force-dynamic";

/**
 * Sign a member of staff in.
 *
 * Structurally /api/auth/login, the console's route, with three differences:
 * it reads the Employee table, it throttles per address as well as per IP, and
 * the cookie it sets lives thirty minutes rather than thirty days — the window
 * lib/employee-session.ts slides forward on every authenticated request.
 *
 * One answer for every failure. "No such address", "wrong password" and
 * "account switched off" are one sentence and one status code, because telling
 * them apart is telling a stranger which addresses are staff addresses.
 */
const GENERIC = "Invalid email or password.";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const turnstileToken = typeof body?.turnstileToken === "string" ? body.turnstileToken : "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    // Turnstile only when it is configured, matching /api/auth/login: a missing
    // secret must not lock the team out of a console they can reach locally.
    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (turnstileSecret) {
      if (!turnstileToken) {
        return NextResponse.json({ error: "Please complete the security check." }, { status: 400 });
      }
      const form = new URLSearchParams();
      form.append("secret", turnstileSecret);
      form.append("response", turnstileToken);
      const cf = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        body: form,
      });
      const verdict = await cf.json().catch(() => ({ success: false }));
      if (!verdict.success) {
        return NextResponse.json({ error: "Security check failed. Please try again." }, { status: 403 });
      }
    }

    // Two limits, as the customer flow has: per IP in Redis (inert until
    // UPSTASH_* exist) and per address in the database, which always holds.
    const perIp = await checkLoginRateLimit(request);
    if (!perIp.success) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": Math.ceil(((perIp.reset || Date.now()) - Date.now()) / 1000).toString() },
        }
      );
    }
    if ((await countRecentLoginFailures(email)) >= LOGIN_MAX_FAILURES) {
      return NextResponse.json(
        { error: "Too many failed attempts. Try again in 15 minutes, or reset your password." },
        { status: 429, headers: { "Retry-After": "900" } }
      );
    }

    const employee = await prisma.employee.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        region: true,
        isActive: true,
        tokenVersion: true,
        passwordHash: true,
      },
    });

    // A deactivated account is counted as a failure like any other: otherwise
    // the difference in response time answers "is this person still staff".
    if (!employee || !employee.isActive) {
      await recordLoginFailure(email);
      return NextResponse.json({ error: GENERIC }, { status: 401 });
    }

    if (!(await verifyPassword(password, employee.passwordHash))) {
      await recordLoginFailure(email);
      return NextResponse.json({ error: GENERIC }, { status: 401 });
    }

    await clearLoginFailures(email);
    await prisma.employee.update({
      where: { id: employee.id },
      data: { lastLoginAt: new Date() },
    });

    const res = NextResponse.json({
      employee: {
        id: employee.id,
        email: employee.email,
        name: employee.name,
        role: employee.role,
        region: employee.region,
        image: employee.image,
      },
    });
    res.cookies.set(
      SESSION_COOKIE,
      signEmployeeSession({
        id: employee.id,
        email: employee.email,
        name: employee.name,
        image: employee.image,
        tokenVersion: employee.tokenVersion,
      }),
      // The browser drops it on the same schedule the server enforces, so a
      // closed laptop does not leave a cookie that is merely ignored.
      { ...cookieOptions, maxAge: Math.floor(EMPLOYEE_IDLE_MS / 1000) }
    );
    return res;
  } catch (error) {
    console.error("employee login error", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
