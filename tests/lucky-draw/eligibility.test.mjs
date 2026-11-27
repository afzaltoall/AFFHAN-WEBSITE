// Who is in the lucky draw by their own answers (the owner, 2026-11-27, over Participants' "Valid passport 9349":
// "make the valid passport persons only come"; Terms clause 3): a valid passport, and nothing else of theirs. The
// answer to "Do you run a business?" and an employee's link, rules from 2026-11-25 to 2026-11-27, no longer matter.
// lib/server/lucky-draw.ts asks the same in SQL (tests/security/lucky-draw.test.mjs holds the query); this is the rule
// the applicant's own page is told by.
import { test } from "node:test";
import assert from "node:assert/strict";
import { inTheDraw } from "@/lib/lucky-draw-shared";
import { EVERY_BUSINESS_STATUS } from "@/lib/trip-application";

test("in the draw: a valid passport; without one, out", () => {
  assert.equal(inTheDraw({ hasPassport: true }), true);
  assert.equal(inTheDraw({ hasPassport: false }), false, "no valid passport");
});

test("every answer to \"Do you run a business?\", and an employee's link, is in with a valid passport", () => {
  const out = [...EVERY_BUSINESS_STATUS.map((s) => s.value), "", "EXISTING_BUSINESS"].filter(
    (businessStatus) => !inTheDraw({ hasPassport: true, businessStatus, referralCode: null, referrerId: null }),
  );
  assert.deepEqual(out, [], "no answer keeps anyone out");
  assert.equal(inTheDraw({ hasPassport: true, businessStatus: "no_business_yet", referralCode: "RAHIM49", referrerId: "employee-1" }), true, "through an employee's link");
  assert.equal(inTheDraw({ hasPassport: false, businessStatus: "existing_business", referralCode: null, referrerId: null }), false);
});
