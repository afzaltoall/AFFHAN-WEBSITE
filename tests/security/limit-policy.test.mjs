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

test("fails closed: the console's and the staff sign-in, and photo search", () => {
  assert.deepEqual(
    named("closed").filter((n) => !n.startsWith("photoSearch")),
    ["consoleLogin", "staffLogin"],
  );
  assert.ok(named("closed").includes("photoSearch"));
});

test("fails open: customers' sign-in, password reset, contact, quote requests, trip applications", () => {
  for (const name of ["customerLogin", "passwordReset", "contact", "inquiry", "tripApplication"]) {
    assert.equal(LIMITS[name].whenDown, "open", name);
  }
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
