import { prisma } from "@/lib/prisma";
import { generateMobileSessionToken, SESSION_DAYS } from "@/lib/mobile-auth";
import { checkVerification, sendVerification } from "@/lib/twilio-verify";
import { maskPhone, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS } from "@/lib/mobile-otp";

// ---------------------------------------------------------------------------
// Phone sign-in, shared by the app and the website.
//
// Both do exactly the same thing with a verified number — find or create the
// account and open a session. The only difference is how the token gets home:
// the app reads it out of the JSON, the browser gets an httpOnly cookie. That
// difference belongs in the routes, so it is the only thing they hold.
// ---------------------------------------------------------------------------

export type PhoneAuthResult =
  | {
      ok: true;
      rawToken: string;
      expiresAt: Date;
      user: {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
        authProvider: string;
        profileImage: string | null;
      };
    }
  | { ok: false; status: number; error: string; needsProfile?: true; reason?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CodeRequestResult =
  | { ok: true; resendAfter: number }
  | { ok: false; status: number; error: string; retryAfter?: number };

/**
 * Ask Twilio to text a code.
 *
 * Twilio rate-limits sends per number itself, but that does not stop a script
 * walking a range of numbers and billing us for each, so there is a cooldown of
 * our own in front of it. The row is written only after Twilio accepts, so a
 * failed send never starts a cooldown for a message that never arrived.
 */
export async function requestPhoneCode(phone: string): Promise<CodeRequestResult> {
  const lastSend = await prisma.mobilePhoneOtp.findFirst({
    where: { phone },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (lastSend) {
    const elapsed = Date.now() - lastSend.createdAt.getTime();
    if (elapsed < OTP_RESEND_COOLDOWN_MS) {
      const retryAfter = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
      return {
        ok: false,
        status: 429,
        error: `Please wait ${retryAfter}s before asking for another code.`,
        retryAfter,
      };
    }
  }

  const sent = await sendVerification(phone);
  if (!sent.ok) {
    if (sent.reason === "unconfigured") {
      console.error("[otp] TWILIO_* env vars are missing; no code was sent.");
      return { ok: false, status: 503, error: sent.message };
    }
    return { ok: false, status: sent.reason === "rate_limited" ? 429 : 400, error: sent.message };
  }

  await prisma.mobilePhoneOtp.create({
    data: { phone, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  console.info(`[otp] code sent to ${maskPhone(phone)}`);

  return { ok: true, resendAfter: Math.ceil(OTP_RESEND_COOLDOWN_MS / 1000) };
}

/**
 * Check the code with Twilio, then sign the customer in.
 *
 * Whether this is a signup or a login is not something the caller declares —
 * it is whether the number already has an account, which only the database
 * knows. A new number with no name/email supplied comes back as needsProfile
 * rather than becoming a placeholder account.
 */
export async function authenticateByPhone(input: {
  phone: string;
  code: string;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
}): Promise<PhoneAuthResult> {
  const check = await checkVerification(input.phone, input.code);
  if (!check.ok) {
    const status =
      check.reason === "unconfigured" ? 503 : check.reason === "too_many_attempts" ? 429 : 400;
    return { ok: false, status, error: check.message, reason: check.reason };
  }

  // The number is proven from here on.
  let user = await prisma.mobileUser.findUnique({ where: { phone: input.phone } });

  if (!user) {
    const firstName = typeof input.firstName === "string" ? input.firstName.trim() : "";
    const lastName = typeof input.lastName === "string" ? input.lastName.trim() : "";
    // The display name every existing screen reads. Composed here rather than
    // split back out of a single field later, which mangles double-barrelled
    // surnames and mononyms.
    const name = [firstName, lastName].filter(Boolean).join(" ");
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";

    if (!name || !email) {
      return {
        ok: false,
        status: 409,
        needsProfile: true,
        error: "This number has no account yet. Tell us your name and email to create one.",
      };
    }
    if (!EMAIL_RE.test(email)) {
      return { ok: false, status: 400, error: "Enter a valid email address." };
    }

    // The email may already belong to an account made by password or Google.
    // Attach the number to it rather than creating a second account for the
    // same person — the unique index would refuse, and refusing is the wrong
    // answer to "I am the same customer".
    const byEmail = await prisma.mobileUser.findUnique({ where: { email } });

    user = byEmail
      ? await prisma.mobileUser.update({
          where: { id: byEmail.id },
          data: {
            phone: input.phone,
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
            email,
            phone: input.phone,
            phoneVerified: true,
            authProvider: "PHONE",
          },
        });
  }

  if (user.accountStatus !== "ACTIVE") {
    return { ok: false, status: 403, error: "Account is suspended." };
  }

  const [updated] = await prisma.$transaction([
    prisma.mobileUser.update({
      where: { id: user.id },
      data: { phoneVerified: true, lastLoginAt: new Date(), loginCount: { increment: 1 } },
    }),
    // Spent send-records are of no further use, and leaving them would anchor
    // the resend cooldown to an old row.
    prisma.mobilePhoneOtp.deleteMany({ where: { phone: input.phone } }),
  ]);

  const { rawToken, tokenHash } = generateMobileSessionToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

  await prisma.mobileSession.create({ data: { tokenHash, userId: updated.id, expiresAt } });

  return {
    ok: true,
    rawToken,
    expiresAt,
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      authProvider: updated.authProvider,
      profileImage: updated.profileImage,
    },
  };
}
