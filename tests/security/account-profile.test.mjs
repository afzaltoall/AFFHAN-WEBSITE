// The app's "Complete your profile" (the owner, 2026-10-16): what /api/mobile/account/profile/ accepts, clears and
// refuses, how the name is kept whole from its halves, and what the app is told about an account, which never
// includes anything secret (src/lib/account-profile.ts). Needs the project's node_modules (zod).
import { test } from "node:test";
import assert from "node:assert/strict";
import { addressLine, describeProfileProblems, profileInput, profileOf, profileUpdate } from "../../src/lib/account-profile.ts";

const parse = (body) => profileInput.safeParse(body);
const kept = (body) => {
  const r = parse(body);
  assert.ok(r.success, `${JSON.stringify(body)} was refused: ${r.success ? "" : describeProfileProblems(r.error).error}`);
  return r.data;
};
const refused = (body, words) => {
  const r = parse(body);
  assert.ok(!r.success, `${JSON.stringify(body)} was accepted`);
  assert.match(describeProfileProblems(r.error).error, words);
  return describeProfileProblems(r.error);
};

const account = (over = {}) => ({
  id: "u1",
  name: "Priya Raman",
  firstName: "Priya",
  lastName: "Raman",
  email: "priya@example.com",
  phone: null,
  phoneVerified: false,
  passwordHash: "$2b$10$secret",
  profileImage: null,
  authProvider: "EMAIL",
  emailVerified: true,
  googleId: "google-sub",
  companyName: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  postalCode: null,
  country: null,
  accountStatus: "ACTIVE",
  loginCount: 3,
  lastLoginAt: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  ...over,
});

test("a whole address is kept, trimmed", () => {
  const d = kept({ address: { line1: " 12 Main Street ", city: "Chennai", state: "Tamil Nadu", postalCode: "600013", country: "India" } });
  // line2 was not sent, so it is not there at all: left as it is.
  assert.deepEqual(d.address, { line1: "12 Main Street", city: "Chennai", state: "Tamil Nadu", postalCode: "600013", country: "India" });
});

test("postal codes as countries write them are kept; anything else is refused with what to fix", () => {
  for (const code of ["600013", "SW1A 1AA", "12345-6789", "K1A 0B6", "1010"]) kept({ address: { postalCode: code } });
  for (const code of ["60 00 13!", "-600013", "<script>", "123456789012345678901"]) refused({ address: { postalCode: code } }, /postal code|too long/i);
});

test("blank or null clears a field; absent leaves it", () => {
  const d = kept({ companyName: "  ", address: { line2: null } });
  assert.equal(d.companyName, null);
  assert.equal(d.address.line2, null);
  assert.equal(d.address.city, undefined);
  assert.equal(d.lastName, undefined);
});

test("too long is refused with a sentence, and the field is named", () => {
  const p = refused({ companyName: "x".repeat(201) }, /Company name is too long/);
  assert.ok("companyName" in p.fields);
  const q = refused({ address: { city: "y".repeat(101) } }, /City is too long/);
  assert.ok("address.city" in q.fields);
});

test("the first name cannot be emptied, and text is required where text is meant", () => {
  refused({ firstName: "   " }, /Enter your first name/);
  refused({ companyName: 42 }, /must be text/);
});

test("anything else in the body is ignored: the email and phone have routes of their own", () => {
  const d = kept({ email: "someone@else.com", phone: "+911234567890", passwordHash: "x", companyName: "AFFHAN" });
  assert.deepEqual(Object.keys(d).sort(), ["companyName"]);
});

test("the name is kept whole from its halves", () => {
  const u = profileUpdate(account(), { firstName: "Priya", lastName: "Krishnan" });
  assert.ok(u.ok);
  assert.equal(u.data.name, "Priya Krishnan");
  const cleared = profileUpdate(account(), { lastName: null });
  assert.ok(cleared.ok);
  assert.equal(cleared.data.name, "Priya");
  assert.equal(cleared.data.lastName, null);
});

test("a last name alone is refused on an account with no first name to go before it", () => {
  const u = profileUpdate(account({ firstName: null, name: "Priya" }), { lastName: "Raman" });
  assert.equal(u.ok, false);
  assert.match(u.error, /first name/);
});

test("only what was sent is written: an address change leaves the name and the other lines alone", () => {
  const u = profileUpdate(account(), kept({ address: { city: "Guangzhou", country: "China" } }));
  assert.ok(u.ok);
  assert.deepEqual(u.data, { city: "Guangzhou", country: "China" });
  const none = profileUpdate(account(), kept({}));
  assert.ok(none.ok);
  assert.deepEqual(none.data, {});
});

test("the app is told about the account, and never its password hash or Google id", () => {
  const p = profileOf(account({ companyName: "AFFHAN", city: "Chennai" }));
  assert.equal(p.hasPassword, true);
  assert.equal(p.companyName, "AFFHAN");
  assert.deepEqual(p.address, { line1: null, line2: null, city: "Chennai", state: null, postalCode: null, country: null });
  for (const key of ["id", "name", "email", "phone", "phoneVerified", "authProvider", "profileImage", "accountStatus", "createdAt"]) {
    assert.ok(key in p, `${key}, which /api/mobile/auth/me has always sent, is missing`);
  }
  const text = JSON.stringify(p);
  assert.doesNotMatch(text, /secret|google-sub/);
  assert.equal(profileOf(account({ passwordHash: null })).hasPassword, false);
});

test("the address reads on one line for the change trail", () => {
  assert.equal(addressLine({ line1: "12 Main Street", city: "Chennai", postalCode: "600013", country: "India" }), "12 Main Street, Chennai, 600013, India");
  assert.equal(addressLine({}), null);
});
