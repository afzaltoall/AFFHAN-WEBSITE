// The Free China Business Trip's applicant cookie (src/lib/trip-applicant-token.ts, 2026-10-28). Applying needs no
// account, so the browser that applied is remembered by a signed cookie naming the application. It signs nobody in,
// and it must never pass for another token, nor another for it: it is signed with a key derived from AUTH_SECRET under
// a label of its own, never AUTH_SECRET itself, which the admin and staff cookies use (src/lib/session-token.ts).
// Those are re-made here by hand, the way session-token.ts makes and checks them.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readTripApplicantToken, signTripApplicantToken, TRIP_APPLICANT_MAX_AGE_MS } from "../../src/lib/trip-applicant-token.ts";
import { readSupplierToken, signSupplierToken } from "../../src/lib/supplier-token.ts";

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
/** A token signed with the applicant key itself, whatever it says (the label is trip-applicant-token.ts's). */
const withApplicantKey = (data) => {
  const key = crypto.createHmac("sha256", SECRET).update("affhan trip applicant v1").digest();
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", key).update(payload).digest("base64url")}`;
};

test("an applicant token reads back as the application it was signed for", () => {
  const t = signTripApplicantToken("app-1", SECRET, NOW);
  assert.equal(readTripApplicantToken(t, SECRET, NOW + 1000), "app-1");
});

test("an applicant token fails the admin and staff cookies' signature check, and an admin cookie is not one", () => {
  assert.equal(passesSessionCheck(signTripApplicantToken("app-1", SECRET, NOW)), false);
  assert.ok(passesSessionCheck(adminToken()), "the hand-made admin cookie is a valid one");
  assert.equal(readTripApplicantToken(adminToken(), SECRET, NOW), null);
});

test("a supplier's token is not an applicant's, nor an applicant's a supplier's", () => {
  assert.equal(readTripApplicantToken(signSupplierToken({ id: "app-1", tokenVersion: 0 }, SECRET, NOW), SECRET, NOW), null);
  assert.equal(readSupplierToken(signTripApplicantToken("sup-1", SECRET, NOW), SECRET, NOW), null);
});

test("signed with the right key but of another kind, or naming nothing: refused", () => {
  assert.equal(readTripApplicantToken(withApplicantKey({ kind: "trip-applicant", sub: "app-1", iat: NOW }), SECRET, NOW), "app-1", "the hand-made one is a valid one");
  assert.equal(readTripApplicantToken(withApplicantKey({ kind: "supplier", sub: "app-1", iat: NOW }), SECRET, NOW), null);
  assert.equal(readTripApplicantToken(withApplicantKey({ kind: "trip-applicant", sub: "", iat: NOW }), SECRET, NOW), null);
  assert.equal(readTripApplicantToken(withApplicantKey({ kind: "trip-applicant", sub: 7, iat: NOW }), SECRET, NOW), null);
  assert.equal(readTripApplicantToken(withApplicantKey({ kind: "trip-applicant", sub: "app-1" }), SECRET, NOW), null);
});

test("an altered token, another key, or no key at all: refused", () => {
  const t = signTripApplicantToken("app-1", SECRET, NOW);
  const [payload, sig] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ kind: "trip-applicant", sub: "app-2", iat: NOW })).toString("base64url");
  assert.equal(readTripApplicantToken(`${forged}.${sig}`, SECRET, NOW), null);
  assert.equal(readTripApplicantToken(t, "t".repeat(48), NOW), null);
  assert.equal(readTripApplicantToken(t, null, NOW), null);
  assert.equal(readTripApplicantToken(`${payload}.${sig}.extra`, SECRET, NOW), null);
  assert.equal(readTripApplicantToken(`${payload}.`, SECRET, NOW), null);
  assert.equal(readTripApplicantToken("", SECRET, NOW), null);
  assert.equal(readTripApplicantToken(undefined, SECRET, NOW), null);
});

test("a year, then it is over; a token from the future is not trusted", () => {
  const t = signTripApplicantToken("app-1", SECRET, NOW);
  assert.equal(readTripApplicantToken(t, SECRET, NOW + TRIP_APPLICANT_MAX_AGE_MS - 1), "app-1");
  assert.equal(readTripApplicantToken(t, SECRET, NOW + TRIP_APPLICANT_MAX_AGE_MS + 1), null);
  const ahead = signTripApplicantToken("app-1", SECRET, NOW + 5 * 60_000);
  assert.equal(readTripApplicantToken(ahead, SECRET, NOW), null);
});
