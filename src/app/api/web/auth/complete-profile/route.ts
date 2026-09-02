import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSignupToken } from "@/lib/signup-token";
import { createWebSession, publicUser, setSessionCookie } from "@/lib/web-session";

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

    // Between the 409 and this call, the same number could have been signed in
    // on another device. Treat that as a login rather than colliding with the
    // unique index.
    let user = await prisma.mobileUser.findUnique({ where: { phone } });

    if (!user) {
      // The email may already belong to an account made with Google or a
      // password. Attach the number to it instead of refusing — it is the same
      // person, and the unique index would refuse anyway.
      const byEmail = await prisma.mobileUser.findUnique({ where: { email } });

      user = byEmail
        ? await prisma.mobileUser.update({
            where: { id: byEmail.id },
            data: {
              phone,
              phoneVerified: true,
              name: byEmail.name || name,
              firstName: byEmail.firstName || firstName || null,
              lastName: byEmail.lastName || lastName || null,
              authProvider: byEmail.authProvider.includes("PHONE")
                ? byEmail.authProvider
                : `${byEmail.authProvider}_AND_PHONE`,
            },
          })
        : await prisma.mobileUser.create({
            data: {
              name,
              firstName: firstName || null,
              lastName: lastName || null,
              phone,
              email,
              phoneVerified: true,
              authProvider: "PHONE",
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
