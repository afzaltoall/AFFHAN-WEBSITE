// The ID proof lock's token (src/lib/id-proof-lock-token.ts, 2026-11-04, the owner: "keep it secure ... with a password,
// a strong lock, access only for admin"). An admin opens applicants' ID proofs by typing their password again; the
// unlock that gives them is good for ten minutes, for that admin on that account version only. It is signed with a key
// derived from AUTH_SECRET, so it can never pass for an admin session (signed with AUTH_SECRET itself, as
// src/lib/session-token.ts does, re-made here by hand), nor a session for an unlock.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { ID_PROOF_UNLOCK_MS, readIdProofUnlock, signIdProofUnlock } from "../../src/lib/id-proof-lock-token.ts";

const SECRET = "s".repeat(48);
const NOW = 1_800_000_000_000;

/** An admin session cookie as signSession writes one: base64url JSON, HMAC-SHA256 with the secret itself. */
const adminSession = (secret = SECRET) => {
  const payload = Buffer.from(JSON.stringify({ id: "a1", email: "x@affhan.com", name: null, role: "admin", tokenVersion: 0, iat: NOW })).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
};
/** readSession's signature check, which every admin cookie passes through first. */
const passesSessionCheck = (token, secret = SECRET) => {
  const [payload, sig] = token.split(".");
  return sig === crypto.createHmac("sha256", secret).update(payload).digest("base64url");
};

test("ten minutes, and an unlock reads back as the admin and version it was signed for, with its end", () => {
  assert.equal(ID_PROOF_UNLOCK_MS, 10 * 60 * 1000);
  const t = signIdProofUnlock({ adminId: "a1", tokenVersion: 4 }, SECRET, NOW);
  assert.deepEqual(readIdProofUnlock(t, SECRET, NOW + 1000), { adminId: "a1", tokenVersion: 4, expiresAt: NOW + ID_PROOF_UNLOCK_MS });
});

test("it ends on time", () => {
  const t = signIdProofUnlock({ adminId: "a1", tokenVersion: 0 }, SECRET, NOW);
  assert.ok(readIdProofUnlock(t, SECRET, NOW + ID_PROOF_UNLOCK_MS - 1));
  assert.equal(readIdProofUnlock(t, SECRET, NOW + ID_PROOF_UNLOCK_MS), null);
  assert.equal(readIdProofUnlock(t, SECRET, NOW + 24 * 60 * 60 * 1000), null);
});

test("an admin session is never an unlock, and an unlock is never a session", () => {
  assert.equal(readIdProofUnlock(adminSession(), SECRET, NOW), null);
  assert.equal(passesSessionCheck(signIdProofUnlock({ adminId: "a1", tokenVersion: 0 }, SECRET, NOW)), false);
});

test("a forged, altered or foreign one is refused, and nothing is trusted without the secret", () => {
  const t = signIdProofUnlock({ adminId: "a1", tokenVersion: 0 }, SECRET, NOW);
  const [payload, sig] = t.split(".");
  assert.equal(readIdProofUnlock(t, "o".repeat(48), NOW), null, "another secret");
  assert.equal(readIdProofUnlock(t, null, NOW), null, "no secret");
  // Another admin, or a longer life, written into the payload: the signature no longer matches.
  const other = Buffer.from(JSON.stringify({ kind: "id-proof-unlock", sub: "a2", v: 0, exp: NOW + ID_PROOF_UNLOCK_MS })).toString("base64url");
  assert.equal(readIdProofUnlock(`${other}.${sig}`, SECRET, NOW), null, "another admin");
  const longer = Buffer.from(JSON.stringify({ kind: "id-proof-unlock", sub: "a1", v: 0, exp: NOW + 365 * 864e5 })).toString("base64url");
  assert.equal(readIdProofUnlock(`${longer}.${sig}`, SECRET, NOW), null, "a longer life");
  for (const bad of ["", ".", `${payload}.`, `.${sig}`, `${payload}.${sig}.x`, `${payload}.${sig.slice(0, -2)}AA`, null, undefined]) {
    assert.equal(readIdProofUnlock(bad, SECRET, NOW), null, String(bad));
  }
});

test("properly signed but claiming more than ten minutes, or another kind, is refused too", () => {
  const key = crypto.createHmac("sha256", SECRET).update("affhan id proof unlock v1").digest();
  const signed = (claims) => {
    const p = Buffer.from(JSON.stringify(claims)).toString("base64url");
    return `${p}.${crypto.createHmac("sha256", key).update(p).digest("base64url")}`;
  };
  assert.ok(readIdProofUnlock(signed({ kind: "id-proof-unlock", sub: "a1", v: 0, exp: NOW + 60_000 }), SECRET, NOW), "the derived key is the one");
  assert.equal(readIdProofUnlock(signed({ kind: "id-proof-unlock", sub: "a1", v: 0, exp: NOW + ID_PROOF_UNLOCK_MS + 1 }), SECRET, NOW), null, "too long");
  assert.equal(readIdProofUnlock(signed({ kind: "supplier", sub: "a1", v: 0, exp: NOW + 60_000 }), SECRET, NOW), null, "another kind");
  assert.equal(readIdProofUnlock(signed({ kind: "id-proof-unlock", sub: "", v: 0, exp: NOW + 60_000 }), SECRET, NOW), null, "no admin");
  assert.equal(readIdProofUnlock(signed({ kind: "id-proof-unlock", sub: "a1", v: "0", exp: NOW + 60_000 }), SECRET, NOW), null, "no version");
});
