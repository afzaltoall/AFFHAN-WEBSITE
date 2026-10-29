import crypto from "crypto";

// ---------------------------------------------------------------------------
// The Free China Business Trip's applicant cookie: the cryptography alone, with
// no database and no path aliases, so tests can load it as it is
// (tests/security/trip-applicant-token.test.mjs). lib/trip-applicant.ts adds the
// cookie and the secret.
//
// Applying needs no account (the owner, 2026-10-28: "remove the login to enter
// for the china free trip page"), so a browser that applied is told apart by
// this: the application's id, signed when the application is recorded. It
// shows that browser its own registration (its boarding pass) and nothing
// more. It signs nobody in, and it is keyed with a key of
// its own DERIVED from AUTH_SECRET, so it can never pass for an admin, staff,
// customer or supplier token, nor any of them for it.
// ---------------------------------------------------------------------------

/** A year: applications close on 25 November 2026, and the trip and its draw follow. */
export const TRIP_APPLICANT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/** What the key is derived with. Changing it makes every browser forget its application. */
const KEY_LABEL = "affhan trip applicant v1";

function applicantKey(authSecret: string): Buffer {
  return crypto.createHmac("sha256", authSecret).update(KEY_LABEL).digest();
}

function sign(payload: string, authSecret: string): string {
  return crypto.createHmac("sha256", applicantKey(authSecret)).update(payload).digest("base64url");
}

/** A cookie value naming this application, signed now. */
export function signTripApplicantToken(applicationId: string, authSecret: string, now: number = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ kind: "trip-applicant", sub: applicationId, iat: now })).toString("base64url");
  return `${payload}.${sign(payload, authSecret)}`;
}

/**
 * The application a cookie names, or null when it is not one of ours: a forged
 * or altered signature, another kind of token, or one older than a year. No
 * secret means no token is trusted. Whether the application still exists and
 * was not deleted is the caller's check.
 */
export function readTripApplicantToken(token: string | null | undefined, authSecret: string | null, now: number = Date.now()): string | null {
  if (!token || !authSecret) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, sig] = parts;
  // Constant-time: a byte-by-byte compare leaks how much of a forged signature was right.
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload, authSecret));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data?.kind !== "trip-applicant") return null;
    if (typeof data.sub !== "string" || !data.sub || typeof data.iat !== "number") return null;
    // Too old, or signed in the future (a clock a minute out is forgiven).
    if (now - data.iat > TRIP_APPLICANT_MAX_AGE_MS || data.iat - now > 60_000) return null;
    return data.sub;
  } catch {
    return null;
  }
}
