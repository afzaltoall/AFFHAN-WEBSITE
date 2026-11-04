import crypto from "crypto";

// ---------------------------------------------------------------------------
// The ID proof lock's token (2026-11-04, the owner: "users ... upload their original ID proof, so keep it secure ...
// with a password, a strong lock, access only for admin"). An applicant's Aadhaar or passport is not shown to an admin
// session on its own: the admin types their password again, and that opens ID proofs for ten minutes, for that admin
// only. This is the cryptography alone, with no database and no path aliases, so a test can load it as it is
// (tests/security/id-proof-lock.test.mjs); lib/server/id-proof-lock.ts adds the cookie and the secret.
//
// Keyed with a key DERIVED from AUTH_SECRET, never AUTH_SECRET itself (which the admin and staff cookies use), so an
// admin session can never pass for an unlock, nor an unlock for a session. It names the admin and the tokenVersion of
// their account, so a password change or "sign out everywhere" closes it as well, and it carries its own end.
// ---------------------------------------------------------------------------

/** How long ID proofs stay open after the password. */
export const ID_PROOF_UNLOCK_MS = 10 * 60 * 1000;

/** What the key is derived with. Changing it locks every open unlock at once. */
const KEY_LABEL = "affhan id proof unlock v1";

export interface IdProofUnlockClaims {
  /** AdminUser.id */
  adminId: string;
  /** AdminUser.tokenVersion when the password was typed. */
  tokenVersion: number;
}

function unlockKey(authSecret: string): Buffer {
  return crypto.createHmac("sha256", authSecret).update(KEY_LABEL).digest();
}

function sign(payload: string, authSecret: string): string {
  return crypto.createHmac("sha256", unlockKey(authSecret)).update(payload).digest("base64url");
}

/** An unlock for this admin, from now until ID_PROOF_UNLOCK_MS from now. */
export function signIdProofUnlock(claims: IdProofUnlockClaims, authSecret: string, now: number = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ kind: "id-proof-unlock", sub: claims.adminId, v: claims.tokenVersion, exp: now + ID_PROOF_UNLOCK_MS }),
  ).toString("base64url");
  return `${payload}.${sign(payload, authSecret)}`;
}

/**
 * The admin and account version an unlock names, and when it ends, or null when it is not a live one of ours: a
 * forged or altered signature, another kind of token, one past its end, or one claiming to last longer than any we
 * sign. No secret means no unlock is trusted. Whether it is this admin's, on this version, is the caller's check.
 */
export function readIdProofUnlock(
  token: string | null | undefined,
  authSecret: string | null,
  now: number = Date.now(),
): (IdProofUnlockClaims & { expiresAt: number }) | null {
  if (!token || !authSecret) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = Buffer.from(sign(parts[0], authSecret));
  const given = Buffer.from(parts[1]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  } catch {
    return null;
  }
  const d = data as { kind?: unknown; sub?: unknown; v?: unknown; exp?: unknown };
  if (d.kind !== "id-proof-unlock" || typeof d.sub !== "string" || !d.sub || typeof d.v !== "number" || typeof d.exp !== "number") return null;
  if (d.exp <= now || d.exp > now + ID_PROOF_UNLOCK_MS) return null;
  return { adminId: d.sub, tokenVersion: d.v, expiresAt: d.exp };
}
