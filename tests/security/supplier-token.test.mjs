// The supplier portal's cookie (src/lib/supplier-token.ts, 2026-10-21). Anyone can create a supplier account, so a
// supplier's token must never pass for an admin's or a member of staff's, nor theirs for a supplier's: it is signed
// with a key derived from AUTH_SECRET, never AUTH_SECRET itself, which is what the admin and staff cookies use
// (src/lib/session-token.ts). Those are re-made here by hand, the way session-token.ts makes and checks them.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readSupplierToken, signSupplierToken, SUPPLIER_TOKEN_MAX_AGE_MS } from "../../src/lib/supplier-token.ts";

const SECRET = "s".repeat(48);
const NOW = 1_800_000_000_000;

/** An admin cookie as signSession writes one: base64url JSON, HMAC-SHA256 with the secret itself. */
const adminToken = (secret = SECRET) => {
  const payload = Buffer.from(JSON.stringify({ id: "a1", email: "x@affhan.com", name: null, role: "admin", tokenVersion: 0, iat: NOW })).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
};
/** readSession's signature check, which every admin and staff cookie passes through first. */
const passesSessionCheck = (token, secret = SECRET) => {
  const [payload, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return sig === expected;
};

test("a supplier token reads back as the account and version it was signed for", () => {
  const t = signSupplierToken({ id: "sup-1", tokenVersion: 3 }, SECRET, NOW);
  assert.deepEqual(readSupplierToken(t, SECRET, NOW + 1000), { id: "sup-1", tokenVersion: 3, issuedAt: NOW });
});

test("a supplier token fails the admin and staff cookies' signature check", () => {
  const t = signSupplierToken({ id: "sup-1", tokenVersion: 0 }, SECRET, NOW);
  assert.equal(passesSessionCheck(t), false);
});

test("an admin cookie is not a supplier token", () => {
  assert.ok(passesSessionCheck(adminToken()), "the hand-made admin cookie is a valid one");
  assert.equal(readSupplierToken(adminToken(), SECRET, NOW), null);
});

test("an altered token, another key, or no key at all: refused", () => {
  const t = signSupplierToken({ id: "sup-1", tokenVersion: 0 }, SECRET, NOW);
  const [payload, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ kind: "supplier", sub: "sup-2", v: 0, iat: NOW })).toString("base64url");
  assert.equal(readSupplierToken(`${forged}.${sig}`, SECRET, NOW), null);
  assert.equal(readSupplierToken(t, "t".repeat(48), NOW), null);
  assert.equal(readSupplierToken(t, null, NOW), null);
  assert.equal(readSupplierToken(`${payload}.${sig}.extra`, SECRET, NOW), null);
  assert.equal(readSupplierToken("", SECRET, NOW), null);
  assert.equal(readSupplierToken(undefined, SECRET, NOW), null);
});

test("thirty days, then it is over; a token from the future is not trusted", () => {
  const t = signSupplierToken({ id: "sup-1", tokenVersion: 0 }, SECRET, NOW);
  assert.ok(readSupplierToken(t, SECRET, NOW + SUPPLIER_TOKEN_MAX_AGE_MS - 1));
  assert.equal(readSupplierToken(t, SECRET, NOW + SUPPLIER_TOKEN_MAX_AGE_MS + 1), null);
  const ahead = signSupplierToken({ id: "sup-1", tokenVersion: 0 }, SECRET, NOW + 5 * 60_000);
  assert.equal(readSupplierToken(ahead, SECRET, NOW), null);
});
