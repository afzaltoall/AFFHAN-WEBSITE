import crypto from "crypto";

// ---------------------------------------------------------------------------
// The Instagram task's passwords (the owner, 2026-11-24: "give usernam and account password entry"): the company keeps
// the accounts it asked its employees to make. This is the cryptography alone, with no database, no cookies and no path
// aliases, so a test can load it as it is (tests/security/instagram-vault.test.mjs); lib/server/instagram-vault.ts adds
// the secret, the table and the lock's cookie.
//
// A password is sealed with AES-256-GCM: a fresh 12-byte iv each time, the 16-byte tag checked on opening, and the
// account's id as additional data, so a sealed password copied onto another account's row never opens. The key is
// DERIVED from AUTH_SECRET with a label of its own, never AUTH_SECRET itself (which signs the sessions), so nothing
// signed for a session can open a password, nor the reverse.
//
// Reading one needs the admin's own password again: the vault lock, a token like the ID proof lock's (ten minutes, that
// admin only, bound to their tokenVersion), under a key derived with another label.
// ---------------------------------------------------------------------------

/** What the key is derived with. Changing it makes every sealed password unreadable. */
const SEAL_LABEL = "affhan instagram vault v1";
/** What the lock's key is derived with. Changing it locks every open vault at once. */
const UNLOCK_LABEL = "affhan instagram vault unlock v1";

/** How long passwords stay open after the admin's password. */
export const VAULT_UNLOCK_MS = 10 * 60 * 1000;

const derive = (authSecret: string, label: string) => crypto.createHmac("sha256", authSecret).update(label).digest();

/** A password, sealed for this account. */
export function sealPassword(plain: string, accountId: string, authSecret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", derive(authSecret, SEAL_LABEL), iv);
  cipher.setAAD(Buffer.from(accountId, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

/** The password a sealed value holds for this account, or null: altered, another account's, another key's, or not ours. */
export function openPassword(sealed: string | null | undefined, accountId: string, authSecret: string | null): string | null {
  if (!sealed || !authSecret || !sealed.startsWith("v1.")) return null;
  const raw = Buffer.from(sealed.slice(3), "base64url");
  if (raw.length < 12 + 16 + 1) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", derive(authSecret, SEAL_LABEL), raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(accountId, "utf8"));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---- the lock ----

export interface VaultUnlockClaims {
  /** AdminUser.id */
  adminId: string;
  /** AdminUser.tokenVersion when the password was typed. */
  tokenVersion: number;
}

const signUnlock = (payload: string, authSecret: string) =>
  crypto.createHmac("sha256", derive(authSecret, UNLOCK_LABEL)).update(payload).digest("base64url");

/** An unlock for this admin, from now until VAULT_UNLOCK_MS from now. */
export function signVaultUnlock(claims: VaultUnlockClaims, authSecret: string, now: number = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ kind: "instagram-vault-unlock", sub: claims.adminId, v: claims.tokenVersion, exp: now + VAULT_UNLOCK_MS }),
  ).toString("base64url");
  return `${payload}.${signUnlock(payload, authSecret)}`;
}

/**
 * The admin and account version an unlock names, and when it ends, or null when it is not a live one of ours: a forged
 * or altered signature, another kind of token (an ID proof unlock among them), one past its end, or one claiming to
 * last longer than any we sign. Whether it is this admin's, on this version, is the caller's check.
 */
export function readVaultUnlock(
  token: string | null | undefined,
  authSecret: string | null,
  now: number = Date.now(),
): (VaultUnlockClaims & { expiresAt: number }) | null {
  if (!token || !authSecret) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = Buffer.from(signUnlock(parts[0], authSecret));
  const given = Buffer.from(parts[1]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  } catch {
    return null;
  }
  const d = data as { kind?: unknown; sub?: unknown; v?: unknown; exp?: unknown };
  if (d.kind !== "instagram-vault-unlock" || typeof d.sub !== "string" || !d.sub || typeof d.v !== "number" || typeof d.exp !== "number") return null;
  if (d.exp <= now || d.exp > now + VAULT_UNLOCK_MS) return null;
  return { adminId: d.sub, tokenVersion: d.v, expiresAt: d.exp };
}
