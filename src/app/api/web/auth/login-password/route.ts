import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  clearLoginFailures,
  countRecentLoginFailures,
  LOGIN_MAX_FAILURES,
  recordLoginFailure,
  verifyPassword,
} from "@/lib/password";
import { createWebSession, publicUser, setSessionCookie } from "@/lib/web-session";

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
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!email || !EMAIL_RE.test(email) || !password) {
      return NextResponse.json({ error: WRONG }, { status: 401 });
    }

    // Per address, counted in the database — Redis is not configured, so a
    // limiter that lived only there would not exist. Checked before the
    // password is read, so a locked-out address costs no bcrypt work either.
    if ((await countRecentLoginFailures(email)) >= LOGIN_MAX_FAILURES) {
      return NextResponse.json(
        { error: "Too many attempts. Try again in 15 minutes, or reset your password." },
        { status: 429 }
      );
    }

    const user = await prisma.mobileUser.findUnique({ where: { email } });

    // One branch for "no account" and "no password", so the two are
    // indistinguishable from outside — and both still cost a failure, or the
    // absence of one would itself be the answer.
    if (!user || !user.passwordHash || user.accountStatus !== "ACTIVE") {
      await recordLoginFailure(email);
      return NextResponse.json({ error: WRONG }, { status: 401 });
    }

    if (!(await verifyPassword(password, user.passwordHash))) {
      await recordLoginFailure(email);
      return NextResponse.json({ error: WRONG }, { status: 401 });
    }

    await clearLoginFailures(email);

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
