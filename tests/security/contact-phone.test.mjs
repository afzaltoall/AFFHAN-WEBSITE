// A contact number (the owner, 2026-10-15): the country code and the digits, a real mobile for its country, kept in
// E.164; anything else refused with a sentence that says what to fix (src/lib/phone.ts, readContactPhone). Needs
// the project's node_modules (libphonenumber-js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { contactE164, readContactPhone } from "../../src/lib/phone.ts";

const kept = (input) => {
  const r = readContactPhone(input);
  assert.ok(r.ok, `${JSON.stringify(input)} was refused: ${r.ok ? "" : r.error}`);
  return r.e164;
};
const refused = (input, words) => {
  const r = readContactPhone(input);
  assert.ok(!r.ok, `${JSON.stringify(input)} was kept as ${r.ok ? r.e164 : ""}`);
  assert.match(r.error, words, JSON.stringify(input));
};

test("a mobile with its country code is kept, in E.164, however it is spaced", () => {
  assert.equal(kept("+919876543210"), "+919876543210");
  assert.equal(kept("+91 98765 43210"), "+919876543210");
  assert.equal(kept("+91-98765-43210"), "+919876543210");
  assert.equal(kept("(+91) 98765.43210"), "+919876543210");
  assert.equal(kept("0091 98765 43210"), "+919876543210");
  assert.equal(kept("+65 9123 4567"), "+6591234567");
  assert.equal(kept("+86 138 1234 5678"), "+8613812345678");
  assert.equal(kept("+971 50 123 4567"), "+971501234567");
  // The US and Canada do not tell a mobile from a landline by the number; signup accepts these too.
  assert.equal(kept("+1 202 555 0123"), "+12025550123");
});

test("nothing typed, or no country code", () => {
  refused("", /Enter your mobile number/);
  refused("   ", /Enter your mobile number/);
  refused(undefined, /Enter your mobile number/);
  refused(919876543210, /Enter your mobile number/);
  refused("98765 43210", /Start with the country code/);
});

test("letters, or a country code that is no country's", () => {
  refused("+91 98765 4321O", /only digits/);
  refused("+999 1234 5678", /country code isn't right/);
});

test("too short, too long", () => {
  refused("+91 98765", /too short/);
  refused("+91 98765 43210 12345", /too long/);
  refused(`+${"9".repeat(40)}`, /too long/);
});

test("a landline is told it is one; a number nobody can have is refused", () => {
  refused("+91 44 2345 6789", /landline/);
  // Ofcom's range for drama: the right length, never anyone's.
  refused("+44 7700 900123", /isn't a valid mobile number/);
});

test("the dialog's field under its dial picker reads the way people type", () => {
  assert.equal(contactE164("98765 43210", "in"), "+919876543210");
  assert.equal(contactE164("098765 43210", "in"), "+919876543210");
  assert.equal(contactE164("91 98765 43210", "in"), "+919876543210");
  assert.equal(contactE164("9123 4567", "sg"), "+6591234567");
  assert.equal(contactE164("", "in"), null);
});
