import crypto from "crypto";

// ---------------------------------------------------------------------------
// The supplier portal's signed cookie: the cryptography alone, with no
// database and no path aliases, so tests can load it as it is
// (tests/security/supplier-token.test.mjs). lib/supplier-session.ts adds the
// cookie, the account lookup and the secret.
//
// Anyone on the internet can create a supplier account (/supplier/register/),
// so a supplier's token must never pass for anything else. The admin and staff
// cookies are HMACs keyed with AUTH_SECRET itself (lib/session-token.ts); this
// one is keyed with a key DERIVED from AUTH_SECRET, so a supplier token checked
// as an admin one, or the other way round, fails its signature before a single
// field of it is read. Its fields are its own as well (sub, v, kind), with no
// `role` for a careless reader to find.
// ---------------------------------------------------------------------------

/** Thirty days, as a customer's session: a supplier signs in again after that. */
export const SUPPLIER_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** What the key is derived with. Changing it signs every supplier out. */
const KEY_LABEL = "affhan supplier session v1";

export interface SupplierClaims {
  /** SupplierAccount.id */
  id: string;
  /** SupplierAccount.tokenVersion when the cookie was signed. */
  tokenVersion: number;
}

function supplierKey(authSecret: string): Buffer {
  return crypto.createHmac("sha256", authSecret).update(KEY_LABEL).digest();
}

function sign(payload: string, authSecret: string): string {
  return crypto.createHmac("sha256", supplierKey(authSecret)).update(payload).digest("base64url");
}

/** A cookie value for this account, signed now. */
export function signSupplierToken(claims: SupplierClaims, authSecret: string, now: number = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ kind: "supplier", sub: claims.id, v: claims.tokenVersion, iat: now }),
  ).toString("base64url");
  return `${payload}.${sign(payload, authSecret)}`;
}

/**
 * The account a cookie names, or null when it is not one of ours: a forged or
 * altered signature, another kind of token, or one older than thirty days. No
 * secret means no token is trusted. Whether the account still exists, is not
 * blocked and is on the same tokenVersion is lib/supplier-session.ts's check.
 */
export function readSupplierToken(
  token: string | null | undefined,
  authSecret: string | null,
  now: number = Date.now(),
): (SupplierClaims & { issuedAt: number }) | null {
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
    if (data?.kind !== "supplier") return null;
    if (typeof data.sub !== "string" || !data.sub) return null;
    if (typeof data.v !== "number" || typeof data.iat !== "number") return null;
    // Too old, or signed in the future (a clock a minute out is forgiven).
    if (now - data.iat > SUPPLIER_TOKEN_MAX_AGE_MS || data.iat - now > 60_000) return null;
    return { id: data.sub, tokenVersion: data.v, issuedAt: data.iat };
  } catch {
    return null;
  }
}
