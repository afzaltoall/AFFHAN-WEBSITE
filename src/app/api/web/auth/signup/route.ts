import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWebSession, publicUser, setSessionCookie } from "@/lib/web-session";
import { checkPasswordStrength, hashPassword } from "@/lib/password";
import { isValidMobileE164 } from "@/lib/phone";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Create an account from one screen: name, email, mobile, password.
 *
 * No OTP anywhere in here. This route deliberately does not call send-otp or
 * verify-otp, and the number it stores is not verified — Twilio production
 * access is pending, and signup is not worth blocking on it. The Twilio code
 * (send-otp, verify-otp, phone-auth) is left in place, untouched, for whenever
 * that phase happens; nothing here deletes it.
 *
 * What that costs us, stated plainly: `phone` is unique on MobileUser, so a
 * number belongs to exactly one account, and nobody has proved this one is
 * theirs. Someone can therefore take a number that is not theirs and, worse,
 * block its real owner from ever using it later. That is a deliberate trade
 * the constraint is not relaxed to hide — the collision is answered with a
 * clear error rather than by allowing two accounts to share a number.
 *
 * Verification of that number, when it comes, belongs after signup: a "verify
 * your number" prompt on an account that already exists, not a gate in front
 * of one that does not.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
    const name =
      [firstName, lastName].filter(Boolean).join(" ") ||
      (typeof body?.name === "string" ? body.name.trim() : "");
    if (!name) {
      return NextResponse.json({ error: "Enter your name." }, { status: 400 });
    }

    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email) {
      return NextResponse.json({ error: "Enter your email address." }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    // The same validation the quote form and this form's own field use, out of
    // the same helper: libphonenumber's full metadata, so the number has to be
    // a real mobile for its country rather than merely the right length. A
    // form is a convenience — anyone can POST straight past it — so the check
    // that matters is this one.
    //
    // Still not proof of OWNERSHIP. That is what the code step did and what
    // this phase does without; this only rejects what could not be a number.
    const phone = typeof body?.phone === "string" ? body.phone.trim().replace(/[\s-]/g, "") : "";
    if (!phone) {
      return NextResponse.json({ error: "Enter your mobile number." }, { status: 400 });
    }
    if (!/^\+[1-9]\d{7,14}$/.test(phone) || !isValidMobileE164(phone)) {
      return NextResponse.json(
        { error: "Enter a valid mobile number, including the country code." },
        { status: 400 }
      );
    }

    const password = typeof body?.password === "string" ? body.password : "";
    const strength = checkPasswordStrength(password);
    if (!strength.ok) {
      return NextResponse.json({ error: strength.error }, { status: 400 });
    }

    // Checked before the insert so the customer gets the reason, not a 500
    // from the unique index. The race where two requests pass this check at
    // once is caught by the P2002 handler below — this is the message, that
    // is the guarantee.
    const [emailTaken, phoneTaken] = await Promise.all([
      prisma.mobileUser.findUnique({ where: { email }, select: { id: true } }),
      prisma.mobileUser.findUnique({ where: { phone }, select: { id: true } }),
    ]);
    if (emailTaken) {
      return NextResponse.json(
        { error: "An account with this email already exists. Sign in instead." },
        { status: 409 }
      );
    }
    if (phoneTaken) {
      return NextResponse.json(
        { error: "This mobile number is already registered on another account." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    let user;
    try {
      user = await prisma.mobileUser.create({
        data: {
          name,
          firstName: firstName || null,
          lastName: lastName || null,
          email,
          phone,
          passwordHash,
          // The number is stored exactly as given and marked unverified,
          // which is the truth: nothing has confirmed it.
          phoneVerified: false,
          emailVerified: false,
          authProvider: "EMAIL",
          lastLoginAt: new Date(),
          loginCount: 1,
        },
      });
    } catch (e) {
      // Two people submitting the same email or number in the same instant
      // both pass the check above; the index is what actually decides. Read
      // which column collided so the message still names the right field.
      const err = e as { code?: string; meta?: { target?: string[] | string } };
      if (err?.code === "P2002") {
        const target = Array.isArray(err.meta?.target)
          ? err.meta.target.join(",")
          : String(err.meta?.target ?? "");
        return NextResponse.json(
          {
            error: target.includes("phone")
              ? "This mobile number is already registered on another account."
              : "An account with this email already exists. Sign in instead.",
          },
          { status: 409 }
        );
      }
      throw e;
    }

    // Signed in straight away. Asking someone to create an account and then
    // sign into it is asking them to type the same password twice.
    const session = await createWebSession(user.id);

    return setSessionCookie(
      NextResponse.json({ success: true, user: publicUser(user) }),
      session
    );
  } catch (error) {
    console.error("Web signup error:", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
