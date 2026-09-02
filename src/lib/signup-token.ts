import crypto from "crypto";

// ---------------------------------------------------------------------------
// Short-lived proof that a phone number passed OTP verification.
//
// Issued when the code is correct but the number has no account yet. It lets
// the customer fill in a name and email as a second step without holding a
// half-made account in the database, and without asking Twilio to verify the
// same number twice.
//
// HMAC-SHA256 over a base64url payload — the same construction as the admin
// session cookie in lib/session.ts, rather than a JWT. It gives the same
// property (the server can tell it issued this and that it has not been
// altered) without adding a dependency for one five-minute token.
//
// It is not a session. It proves one thing — this number was verified just now
// — and nothing signed with it can read or change anything.
// ---------------------------------------------------------------------------

const SECRET = process.env.AUTH_SECRET || "affhan_dev_secret";
export const SIGNUP_TOKEN_TTL_MS = 5 * 60 * 1000;

interface SignupClaims {
  phone: string;
  /** Issued-at, epoch ms. */
  iat: number;
}

export function issueSignupToken(phone: string): string {
  const payload = Buffer.from(JSON.stringify({ phone, iat: Date.now() } satisfies SignupClaims)).toString(
    "base64url"
  );
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/** The phone this token vouches for, or null if it is forged, malformed or stale. */
export function readSignupToken(token: unknown): string | null {
  if (typeof token !== "string") return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  // Constant-time: a byte-by-byte compare leaks how much of a forged signature
  // was right.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as SignupClaims;
    if (typeof claims.phone !== "string" || typeof claims.iat !== "number") return null;
    if (Date.now() - claims.iat > SIGNUP_TOKEN_TTL_MS) return null;
    return claims.phone;
  } catch {
    return null;
  }
}
