import crypto from "crypto";

// ---------------------------------------------------------------------------
// Short-lived proof that an email address passed OTP verification.
//
// The same construction as lib/signup-token.ts — HMAC-SHA256 over a base64url
// payload — for the same reason: the server can tell it issued this and that
// nobody has altered it, without a JWT dependency for a ten-minute token.
//
// A separate module rather than a `purpose` field on the signup token, so a
// token minted to finish a sign-up can never be presented to change somebody's
// password. Two powers, two keys.
//
// It is not a session. It proves one thing — this address answered a code just
// now — and the only route that accepts it is the one that sets the password.
// ---------------------------------------------------------------------------

const SECRET = process.env.AUTH_SECRET || "affhan_dev_secret";

/**
 * Ten minutes: long enough to type a new password twice and think about it,
 * short enough that a token left in a closed tab is worthless by the time
 * anyone finds it.
 */
export const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;

interface ResetClaims {
  /** Lower-cased address the code was sent to. */
  email: string;
  /**
   * The EmailOtp row this token was minted from.
   *
   * An HMAC carries no state, so on its own a token stays valid for its whole
   * ten minutes however many times it is used — measured: a second call to
   * reset-password with the same token changed the password again. Naming the
   * row gives the reset step something it can mark as spent, which is what
   * makes the token single-use.
   */
  otpId: string;
  /** Issued-at, epoch ms. */
  iat: number;
  /** Distinguishes this from any other HMAC we sign with the same secret. */
  kind: "pwreset";
}

export interface ResetClaimsOut {
  email: string;
  otpId: string;
}

export function issueResetToken(email: string, otpId: string): string {
  const claims: ResetClaims = {
    email: email.trim().toLowerCase(),
    otpId,
    iat: Date.now(),
    kind: "pwreset",
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** What this token vouches for, or null if forged, malformed or stale. */
export function readResetToken(token: unknown): ResetClaimsOut | null {
  if (typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  // Constant-time: a byte-by-byte compare leaks how much of a forged signature
  // was right, which is enough to build the rest.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as ResetClaims;
    if (claims.kind !== "pwreset") return null;
    if (typeof claims.email !== "string" || typeof claims.otpId !== "string") return null;
    if (typeof claims.iat !== "number") return null;
    if (Date.now() - claims.iat > RESET_TOKEN_TTL_MS) return null;
    return { email: claims.email, otpId: claims.otpId };
  } catch {
    return null;
  }
}
