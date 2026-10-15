import crypto from "crypto";

// ---------------------------------------------------------------------------
// One-time codes: how they are made, hashed and checked. The password-reset
// codes sent by email use these (lib/email-otp.ts, lib/email-templates.ts).
//
// The file kept its name when phone sign-in and its text-message codes were
// removed (2026-10-15); only the parts the email codes share remain.
//
// Same shape as the session tokens: only a hash reaches the database, so a copy
// of the table is not a set of working codes.
// ---------------------------------------------------------------------------

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
// A new code cannot be requested until this has passed, so the send button
// cannot be held down to flood someone's inbox.
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

/** A uniformly random 6-digit code, zero-padded. */
export function generateOtp(): string {
  // randomInt avoids the modulo bias that (randomBytes % 1000000) would give.
  return String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
}

export function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/** Constant-time compare, so a wrong code cannot be narrowed by timing. */
export function otpMatches(code: string, hash: string): boolean {
  const a = Buffer.from(hashOtp(code));
  const b = Buffer.from(hash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
