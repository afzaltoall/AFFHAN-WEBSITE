// The rate limits' policy when Upstash is missing or does not answer (src/lib/limit-policy.ts, the owner's call of
// 2026-10-09): the console's and the staff sign-in and photo search refuse (503); everything else lets the request
// through with a logged warning; and under `next dev` nothing refuses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITS, whenUpstashDown } from "../../src/lib/limit-policy.ts";

const named = (when) =>
  Object.entries(LIMITS)
    .filter(([, spec]) => spec.whenDown === when)
    .map(([name]) => name)
    .sort();

test("fails closed: the console's and the staff sign-in, photo search (its own count and its ceiling), supplier photo uploads", () => {
  assert.deepEqual(named("closed"), ["consoleLogin", "photoSearch", "photoSearchPerIp", "staffLogin", "supplierUpload"]);
});

test("the supplier portal (2026-10-21): sign-in, registration and applications fail open, each with its own hold", () => {
  for (const name of ["supplierLogin", "supplierRegister", "supplierVerify", "supplierApply"]) assert.equal(LIMITS[name].whenDown, "open", name);
  assert.equal(LIMITS.supplierLogin.per, "IP");
  assert.equal(LIMITS.supplierRegister.per, "IP");
  assert.equal(LIMITS.supplierVerify.per, "IP");
  assert.equal(LIMITS.supplierApply.per, "account");
  assert.equal(LIMITS.supplierUpload.per, "account");
  // Five photos an application: room for a supplier's busy hour.
  assert.ok(LIMITS.supplierUpload.count >= 5 * 20, `${LIMITS.supplierUpload.count}`);
});

test("cargo tracking (2026-10-24): per IP, open when Upstash is down, and too few to walk the numbers", () => {
  assert.equal(LIMITS.cargoTrack.per, "IP");
  assert.equal(LIMITS.cargoTrack.whenDown, "open");
  assert.ok(LIMITS.cargoTrack.count <= 100, `${LIMITS.cargoTrack.count}`);
});

test("photo search: at least 30 an hour for each user, counted by account when signed in", () => {
  assert.equal(LIMITS.photoSearch.per, "account or IP");
  assert.equal(LIMITS.photoSearch.window, "1 h");
  assert.ok(LIMITS.photoSearch.count >= 30, `${LIMITS.photoSearch.count}`);
  // The per-connection ceiling must not be what a single user meets first.
  assert.ok(LIMITS.photoSearchPerIp.count > LIMITS.photoSearch.count);
});

test("a shared connection gets room: per-connection limits sit above what one person does", () => {
  assert.ok(LIMITS.customerLogin.count >= 10, "customer sign-in");
  assert.ok(LIMITS.passwordReset.count >= 5, "password reset");
});

test("fails open: customers' sign-in, password reset, contact, quote requests, trip applications, saving a number", () => {
  for (const name of ["customerLogin", "passwordReset", "contact", "inquiry", "tripApplication", "contactPhone"]) {
    assert.equal(LIMITS[name].whenDown, "open", name);
  }
});

test("saving a contact number: 10 an hour, per account (the owner, 2026-10-15)", () => {
  assert.equal(LIMITS.contactPhone.per, "account");
  assert.equal(LIMITS.contactPhone.count, 10);
  assert.equal(LIMITS.contactPhone.window, "1 h");
});

test("in production a closed limit refuses and an open one lets through; under next dev nothing refuses", () => {
  assert.equal(whenUpstashDown("closed", true), "refuse");
  assert.equal(whenUpstashDown("open", true), "allow");
  assert.equal(whenUpstashDown("closed", false), "allow");
  assert.equal(whenUpstashDown("open", false), "allow");
});

test("quote requests count per account, website and app together", () => {
  assert.equal(LIMITS.inquiry.per, "account");
});

test("every limit has a count and a window Upstash can read", () => {
  for (const [name, spec] of Object.entries(LIMITS)) {
    assert.ok(Number.isInteger(spec.count) && spec.count >= 1, name);
    assert.match(spec.window, /^\d+ [smhd]$/, name);
  }
});
