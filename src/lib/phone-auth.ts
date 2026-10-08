import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateMobileSessionToken, SESSION_DAYS } from "@/lib/mobile-auth";
import { checkVerification, sendVerification, twilioConfig } from "@/lib/twilio-verify";
import { maskPhone, OTP_RESEND_COOLDOWN_MS, OTP_TTL_MS } from "@/lib/mobile-otp";
import { EMAIL_TAKEN_MESSAGE, phonePlan } from "@/lib/phone-linking";
import { DAY_MS, HOUR_MS, otpCapReached, siteDailyCap, type OtpCap } from "@/lib/otp-caps";
import { authSecret } from "@/lib/secrets";

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

/** A connection's IP as stored with a send: an HMAC under AUTH_SECRET, so the table counts connections without holding addresses. */
function ipFingerprint(ip: string): string {
  return crypto.createHmac("sha256", authSecret()).update(`otp-ip:${ip}`).digest("hex");
}

/** What each cap says, in the customer's words. The site-wide one is ours to fix, so it is a 503. */
const CAP_REPLY: Record<OtpCap, { status: number; error: string }> = {
  site_day: { status: 503, error: "Text-message codes are paused for today. Sign in with your email and password, or with Google." },
  ip_day: { status: 429, error: "Too many codes have been asked for from this connection. Try again later." },
  ip_hour: { status: 429, error: "Too many codes have been asked for from this connection. Try again later." },
  number_day: { status: 429, error: "Too many codes have been sent to this number. Try again later." },
  number_hour: { status: 429, error: "Too many codes have been sent to this number. Try again later." },
};

/** Seconds until the oldest send inside the window leaves it, which is when a refused cap next has room. */
async function secondsUntilRoom(where: Prisma.MobilePhoneOtpWhereInput, windowMs: number, now: number): Promise<number> {
  const oldest = await prisma.mobilePhoneOtp.findFirst({
    where: { ...where, createdAt: { gte: new Date(now - windowMs) } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  return oldest ? Math.max(1, Math.ceil((oldest.createdAt.getTime() + windowMs - now) / 1000)) : 60;
}

/**
 * Ask Twilio to text a code.
 *
 * Twilio rate-limits sends per number itself, but that does not stop a script
 * walking a range of numbers and billing us for each. A cooldown of our own
 * per number is in front of it, and behind that the caps in lib/otp-caps.ts:
 * per number, per connection (`ip`) and for the whole site (security audit
 * 2026-10-08, H7). The row is written only after Twilio accepts, so a failed
 * send never counts against anyone for a message that never arrived.
 *
 * A number's rows are cleared when its code signs someone in
 * (authenticateByPhone), so the caps count the codes nobody used: what
 * pumping produces, and not a customer who signs in every day.
 */
export async function requestPhoneCode(phone: string, ip: string): Promise<CodeRequestResult> {
  // Without Twilio no text can go, so nothing is counted or written either.
  if (!twilioConfig()) {
    console.error("[otp] TWILIO_* env vars are missing; no code was sent.");
    return { ok: false, status: 503, error: "Phone sign-in is not available yet." };
  }

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

  const now = Date.now();
  const hourAgo = new Date(now - HOUR_MS);
  const dayAgo = new Date(now - DAY_MS);
  const ipHash = ipFingerprint(ip);
  const [numberHour, numberDay, ipHour, ipDay, siteDay] = await Promise.all([
    prisma.mobilePhoneOtp.count({ where: { phone, createdAt: { gte: hourAgo } } }),
    prisma.mobilePhoneOtp.count({ where: { phone, createdAt: { gte: dayAgo } } }),
    prisma.mobilePhoneOtp.count({ where: { ipHash, createdAt: { gte: hourAgo } } }),
    prisma.mobilePhoneOtp.count({ where: { ipHash, createdAt: { gte: dayAgo } } }),
    prisma.mobilePhoneOtp.count({ where: { createdAt: { gte: dayAgo } } }),
  ]);
  const siteCap = siteDailyCap(process.env.OTP_DAILY_CAP);
  const cap = otpCapReached({ numberHour, numberDay, ipHour, ipDay, siteDay }, siteCap);
  if (cap) {
    const scope: Prisma.MobilePhoneOtpWhereInput =
      cap === "site_day" ? {} : cap.startsWith("ip_") ? { ipHash } : { phone };
    const retryAfter = await secondsUntilRoom(scope, cap.endsWith("_hour") ? HOUR_MS : DAY_MS, now);
    if (cap === "site_day") console.error(`[otp] the site's cap of ${siteCap} codes a day is reached; sends are refused.`);
    else console.warn(`[otp] ${cap} cap reached for ${maskPhone(phone)}`);
    return { ok: false, ...CAP_REPLY[cap], retryAfter };
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
    data: { phone, ipHash, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
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
 * rather than becoming a placeholder account, and one whose email already has
 * an account is refused (lib/phone-linking.ts).
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
    const hasProfile = Boolean(name && email);

    if (hasProfile && !EMAIL_RE.test(email)) {
      return { ok: false, status: 400, error: "Enter a valid email address." };
    }

    // The code proved the number and nothing else. An email that already had
    // an account used to get this number attached and a session opened on it,
    // so anyone with a phone could enter somebody else's account by typing
    // their address (security audit 2026-10-08, C1). It is refused now: the
    // owner signs in to that account and adds the number from Account.
    const emailTaken =
      hasProfile &&
      Boolean(await prisma.mobileUser.findUnique({ where: { email }, select: { id: true } }));
    const plan = phonePlan({ accountForPhone: false, hasProfile, emailTaken });

    if (plan.kind === "needs_profile") {
      return {
        ok: false,
        status: 409,
        needsProfile: true,
        error: "This number has no account yet. Tell us your name and email to create one.",
      };
    }
    if (plan.kind === "email_taken") {
      return { ok: false, status: 409, error: EMAIL_TAKEN_MESSAGE, reason: "email_taken" };
    }

    user = await prisma.mobileUser.create({
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
