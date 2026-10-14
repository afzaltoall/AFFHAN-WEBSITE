import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkStaffLoginRateLimit, getClientIp, limiterUnavailable } from "@/lib/rate-limit";
import { checkTurnstile } from "@/lib/turnstile";
import {
  clearLoginFailures,
  recordLoginFailure,
  verifyPassword,
  windowLockRemainingMs,
} from "@/lib/password";
import { lockedMessage } from "@/lib/login-lockout";
import { SESSION_COOKIE } from "@/lib/session";
import {
  dropLegacyStaffCookie,
  signEmployeeSession,
  STAFF_SESSION_COOKIE,
  staffCookieOptions,
} from "@/lib/employee-session";

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

    // Turnstile as /api/auth/login has it (lib/turnstile.ts): skipped under
    // `next dev` when the secret is missing, so the team can reach a local
    // console, and refused in production, where skipping meant no check.
    const human = await checkTurnstile(turnstileToken, getClientIp(request));
    if (!human.ok) {
      return NextResponse.json({ error: human.error }, { status: human.status });
    }

    // Two limits, as the customer flow has: per connection in Upstash, which
    // fails closed (a 503 while it is missing or down; lib/limit-policy.ts),
    // and per address in the database, which always holds.
    const perIp = await checkStaffLoginRateLimit(request);
    if (perIp.unavailable) return limiterUnavailable("Sign-in");
    if (!perIp.success) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": Math.ceil(((perIp.reset || Date.now()) - Date.now()) / 1000).toString() },
        }
      );
    }
    // The real wait, not a flat fifteen minutes: the window lifts when the
    // failure that made the count five leaves it.
    const lockedMs = await windowLockRemainingMs(email);
    if (lockedMs !== null) {
      return NextResponse.json(
        { error: lockedMessage(lockedMs), reason: "locked" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(lockedMs / 1000)) } }
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
    // Its own slot, so an admin session in this browser is left alone — see
    // STAFF_SESSION_COOKIE. The options drop it on the same schedule the
    // server enforces, so a closed laptop does not leave a cookie that is
    // merely ignored.
    res.cookies.set(
      STAFF_SESSION_COOKIE,
      signEmployeeSession({
        id: employee.id,
        email: employee.email,
        name: employee.name,
        image: employee.image,
        tokenVersion: employee.tokenVersion,
      }),
      staffCookieOptions
    );
    return dropLegacyStaffCookie(res, request.cookies.get(SESSION_COOKIE)?.value);
  } catch (error) {
    console.error("employee login error", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
