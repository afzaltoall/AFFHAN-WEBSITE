import crypto from "crypto";

// ---------------------------------------------------------------------------
// One-time codes for phone sign-in.
//
// Same shape as the session tokens: only a hash reaches the database, so a copy
// of the table is not a set of working logins.
// ---------------------------------------------------------------------------

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
// A new code cannot be requested until this has passed, so "Send OTP" cannot be
// held down to bill us for SMS or to flood someone else's phone.
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

/**
 * Normalise to E.164. The app sends a bare 10-digit Indian number behind a +91
 * prefix, but people paste all sorts of things, so leading zeros, spaces,
 * dashes and a duplicated country code are all folded to one canonical form —
 * otherwise the same person becomes two accounts.
 */
export function normalisePhone(input: unknown): string | null {
  if (typeof input !== "string") return null;
  let s = input.replace(/[\s()-]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);

  if (s.startsWith("+")) {
    const digits = s.slice(1).replace(/\D/g, "");
    // E.164 allows at most 15 digits, and a country code needs at least 8 to
    // be a real subscriber number anywhere.
    if (digits.length < 8 || digits.length > 15) return null;
    return "+" + digits;
  }

  const digits = s.replace(/\D/g, "");
  if (digits.length === 10) return "+91" + digits; // bare Indian mobile
  if (digits.length === 11 && digits.startsWith("0")) return "+91" + digits.slice(1);
  if (digits.length === 12 && digits.startsWith("91")) return "+" + digits;
  return null;
}

/** Last two digits only, for logs and error copy. */
export function maskPhone(phone: string): string {
  return phone.length <= 4 ? phone : phone.slice(0, 3) + "•".repeat(phone.length - 5) + phone.slice(-2);
}

export interface SmsResult {
  delivered: boolean;
  provider: string;
}

/**
 * Send the code.
 *
 * No SMS provider is configured for this project yet. Rather than pretend, an
 * unconfigured deployment logs the code server-side and reports delivered:false,
 * which the route passes back so the app can say so plainly instead of leaving
 * someone waiting for a message that is not coming.
 *
 * To go live, set SMS_PROVIDER and its credentials and add the branch here.
 */
export async function sendOtpSms(phone: string, code: string): Promise<SmsResult> {
  const provider = process.env.SMS_PROVIDER;

  if (!provider) {
    // DO NOT LOG THE OTP.
    // The user explicitly requested to return a clear "SMS provider not configured" error
    // and block OTP sending instead of mocking it.
    throw new Error("SMS provider not configured. OTP delivery is disabled.");
  }

  // Once a provider is implemented (e.g. Twilio/SNS), the integration goes here.
  throw new Error(`SMS_PROVIDER="${provider}" is set but no sender is implemented for it.`);
}
