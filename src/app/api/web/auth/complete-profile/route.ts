import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSignupToken } from "@/lib/signup-token";
import { createWebSession, publicUser, setSessionCookie } from "@/lib/web-session";
import { checkPasswordStrength, hashPassword } from "@/lib/password";
import { EMAIL_TAKEN_MESSAGE, phonePlan } from "@/lib/phone-linking";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Finish a signup the OTP step left open.
 *
 * The phone comes from the signed token, never from the body — otherwise
 * anyone could verify their own number and then create an account against
 * somebody else's.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const phone = readSignupToken(body?.signupToken);
    if (!phone) {
      return NextResponse.json(
        { error: "That took too long. Please request a new code." },
        { status: 401 }
      );
    }

    // The halves are what get stored; `name` is the display form built from
    // them. Older clients send only `name`, so fall back to it rather than
    // rejecting — but never split it back apart, which is the guess this pair
    // of columns exists to avoid.
    const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
    const name =
      [firstName, lastName].filter(Boolean).join(" ") ||
      (typeof body?.name === "string" ? body.name.trim() : "");
    if (!name) {
      return NextResponse.json({ error: "Enter your name." }, { status: 400 });
    }

    // Required on signup, unlike everywhere else. A quote is a conversation
    // that continues off the site — the reply, the spec, the invoice all go to
    // an address, and an account with no way to be written to is an account we
    // cannot answer.
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) {
      return NextResponse.json({ error: "Enter your email address." }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    // Required from here on. The number is still what proves the account, but
    // a password is what lets the customer back in next time without another
    // SMS — which is the whole point of asking for one. Accounts made before
    // this have none and are not broken by it: they sign in with a code or
    // with Google, and can add a password from /account.
    const password = typeof body?.password === "string" ? body.password : "";
    const strength = checkPasswordStrength(password);
    if (!strength.ok) {
      return NextResponse.json({ error: strength.error }, { status: 400 });
    }

    // Between the 409 and this call, the same number could have been signed in
    // on another device. Treat that as a login rather than colliding with the
    // unique index. Nothing typed here is written to that account: the token
    // proves the number, not the email or a password.
    let user = await prisma.mobileUser.findUnique({ where: { phone } });

    if (!user) {
      // An email that already had an account used to get this number attached,
      // a password set if it had none, and a session, so anyone with a phone
      // could take over somebody else's account by typing their address
      // (security audit 2026-10-08, C1). It is refused now: the owner signs in
      // to that account and adds the number from Account.
      const emailTaken = Boolean(
        await prisma.mobileUser.findUnique({ where: { email }, select: { id: true } })
      );
      if (phonePlan({ accountForPhone: false, hasProfile: true, emailTaken }).kind === "email_taken") {
        return NextResponse.json({ error: EMAIL_TAKEN_MESSAGE, reason: "email_taken" }, { status: 409 });
      }

      user = await prisma.mobileUser.create({
        data: {
          name,
          firstName: firstName || null,
          lastName: lastName || null,
          phone,
          email,
          passwordHash: await hashPassword(password),
          phoneVerified: true,
          // Both ways in from the start: the number that was just proved,
          // and the password just chosen.
          authProvider: "PHONE_AND_EMAIL",
          lastLoginAt: new Date(),
          loginCount: 1,
        },
      });
    }

    if (user.accountStatus !== "ACTIVE") {
      return NextResponse.json({ error: "This account is not active." }, { status: 403 });
    }

    const session = await createWebSession(user.id);

    return setSessionCookie(
      NextResponse.json({ success: true, user: publicUser(user) }),
      session
    );
  } catch (error) {
    console.error("Web complete-profile error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
