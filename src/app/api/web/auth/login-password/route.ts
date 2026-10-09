import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  beginLoginAttempt,
  clearLoginFailures,
  customerLoginKey,
  verifyPasswordOrNothing,
} from "@/lib/password";
import { lockedMessage } from "@/lib/login-lockout";
import { createWebSession, publicUser, setSessionCookie } from "@/lib/web-session";
import { checkTurnstile } from "@/lib/turnstile";
import { getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One sentence for every way this can fail. See the note below. */
const WRONG = "Incorrect email or password.";

/**
 * Sign in with an email address and a password.
 *
 * Every failure says the same thing. No account, no password on the account,
 * a Google-only account, the wrong password — all "Incorrect email or
 * password". Naming which would turn this route into a way of asking whether
 * an address has an account here, and a second way of asking how it signs in.
 *
 * That sameness costs something real: a customer who signed up with Google is
 * told their password is wrong when they never had one. The account page and
 * the phone fallback are where that gets resolved, and the reset flow emails
 * them an explanation — see lib/email-templates.ts. It is the right trade for
 * an unauthenticated endpoint.
 *
 * The session is the same one the phone flow opens: createWebSession, the same
 * row on the same table, the same httpOnly cookie. Nothing about sessions is
 * decided here.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // Turnstile first, before any count or lookup (2026-10-09). The website is
    // the only caller; the app signs in at /api/mobile/auth/login, which cannot
    // show the widget.
    const human = await checkTurnstile(body?.turnstileToken, getClientIp(request));
    if (!human.ok) return NextResponse.json({ error: human.error }, { status: human.status });

    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !EMAIL_RE.test(email) || !password) {
      return NextResponse.json({ error: WRONG }, { status: 401 });
    }

    // Per address, counted in the database — Redis is not configured, so a
    // limiter that lived only there would not exist. Five failures lock it for
    // fifteen minutes, each five after that for twice as long
    // (lib/login-lockout.ts), on one count with the app's sign-in, which signs
    // in the same accounts (security audit 2026-10-08, H5). Checked before the
    // password is read, so a locked-out address costs no bcrypt work either.
    const gate = await beginLoginAttempt(customerLoginKey(email));
    if (gate.locked) {
      return NextResponse.json(
        { error: lockedMessage(gate.retryAfterMs), reason: "locked" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) } }
      );
    }

    const user = await prisma.mobileUser.findUnique({ where: { email } });

    // One branch for "no account", "no password" and a wrong one, after the
    // same bcrypt work, so they are indistinguishable from outside — and each
    // still costs a failure, or the absence of one would itself be the answer.
    const matches = await verifyPasswordOrNothing(password, user?.passwordHash);
    if (!user || user.accountStatus !== "ACTIVE" || !matches) {
      return NextResponse.json({ error: WRONG }, { status: 401 });
    }

    await clearLoginFailures(customerLoginKey(email));

    const updated = await prisma.mobileUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), loginCount: { increment: 1 } },
    });

    const session = await createWebSession(user.id);
    return setSessionCookie(
      NextResponse.json({ success: true, user: publicUser(updated) }),
      session
    );
  } catch (error) {
    console.error("Password login error:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
