import { prisma } from "@/lib/prisma";
import {
  generateOtp,
  hashOtp,
  otpMatches,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
} from "@/lib/mobile-otp";

// ---------------------------------------------------------------------------
// One-time codes sent to an email address.
//
// Structurally the phone flow, with the delivery channel swapped — same code
// generator, same hashing, same TTL, same attempt ceiling. What differs is who
// holds the code: Twilio Verify keeps and checks the phone codes, so
// MobilePhoneOtp only records when one was asked for. Nobody holds an email
// code for us, so this module stores and checks it here.
//
// The code is returned to the caller exactly once, so it can be put in an
// email. It is never written to a log, never returned in an HTTP response, and
// only its SHA-256 reaches the database.
// ---------------------------------------------------------------------------

export type OtpPurpose = "PASSWORD_RESET";

/**
 * Codes per address per window, enforced in the database.
 *
 * Deliberately not only in Redis. The Upstash limiters in lib/rate-limit.ts
 * fail open when they are not configured — which is the case right now, no
 * UPSTASH_* variables exist — so a limit that lived only there would not exist
 * at all. This one holds whether or not Redis is ever set up, because the rows
 * it counts are the same rows the flow already writes.
 */
export const OTP_MAX_PER_EMAIL = 3;
export const OTP_EMAIL_WINDOW_MS = 15 * 60 * 1000;

export type IssueResult =
  | { ok: true; code: string }
  | { ok: false; reason: "cooldown" | "window"; retryAfterSeconds: number };

/**
 * Mint a code for this address, unless it has asked too recently or too often.
 *
 * Two limits, doing different jobs. The cooldown stops a held-down button and
 * the mail it would generate. The window stops a slow drip that would sit
 * under the cooldown all day and fill someone else's inbox.
 */
export async function issueEmailOtp(
  email: string,
  purpose: OtpPurpose
): Promise<IssueResult> {
  const address = email.trim().toLowerCase();
  const now = Date.now();

  const recent = await prisma.emailOtp.findMany({
    where: { email: address, purpose, createdAt: { gte: new Date(now - OTP_EMAIL_WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const last = recent[0];
  if (last) {
    const elapsed = now - last.createdAt.getTime();
    if (elapsed < OTP_RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        reason: "cooldown",
        retryAfterSeconds: Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000),
      };
    }
  }

  if (recent.length >= OTP_MAX_PER_EMAIL) {
    // Wait until the oldest of them leaves the window.
    const oldest = recent[recent.length - 1].createdAt.getTime();
    return {
      ok: false,
      reason: "window",
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + OTP_EMAIL_WINDOW_MS - now) / 1000)),
    };
  }

  const code = generateOtp();
  await prisma.emailOtp.create({
    data: {
      email: address,
      purpose,
      codeHash: hashOtp(code),
      expiresAt: new Date(now + OTP_TTL_MS),
    },
  });

  return { ok: true, code };
}

export type CheckResult =
  /** The id of the row that was accepted, so the caller can bind a token to it. */
  | { ok: true; otpId: string }
  | { ok: false; reason: "no_code" | "expired" | "too_many_attempts" | "wrong_code" };

/**
 * Check a code and burn it.
 *
 * Only the newest unconsumed code counts. Asking for a second code has to
 * retire the first, or a slow attacker gets several live codes at once and the
 * attempt ceiling means much less than it looks.
 */
export async function checkEmailOtp(
  email: string,
  purpose: OtpPurpose,
  code: string
): Promise<CheckResult> {
  const address = email.trim().toLowerCase();

  const row = await prisma.emailOtp.findFirst({
    where: { email: address, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!row) return { ok: false, reason: "no_code" };

  if (row.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }

  if (!otpMatches(code, row.codeHash)) {
    // Counted before the answer is given, so a wrong guess costs an attempt
    // whatever the caller does next.
    await prisma.emailOtp.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: "wrong_code" };
  }

  await prisma.emailOtp.update({
    where: { id: row.id },
    data: { consumedAt: new Date(), attempts: { increment: 1 } },
  });

  return { ok: true, otpId: row.id };
}

/**
 * Mark the token minted from this code as spent, and say whether it was ours
 * to spend.
 *
 * The update is conditional on resetAt still being null, so two requests
 * arriving together cannot both win: the second matches no rows and is told
 * the token is used. That is the whole single-use guarantee, and it lives in
 * one statement rather than in a read followed by a write.
 */
export async function spendResetToken(otpId: string, email: string): Promise<boolean> {
  const { count } = await prisma.emailOtp.updateMany({
    where: {
      id: otpId,
      email: email.trim().toLowerCase(),
      purpose: "PASSWORD_RESET",
      consumedAt: { not: null },
      resetAt: null,
    },
    data: { resetAt: new Date() },
  });
  return count === 1;
}

/** Retire any live codes for an address — used once a password is actually set. */
export async function consumeAllEmailOtps(email: string, purpose: OtpPurpose): Promise<void> {
  await prisma.emailOtp.updateMany({
    where: { email: email.trim().toLowerCase(), purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });
}
