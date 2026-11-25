// Who is in the lucky draw by their own answers (the owner, 2026-11-25: "which user from the luck draw runs a business
// have to be there remaining users are dont", and of the answers, "Only 'Yes, I run a business'"; Terms clause 3): a
// valid passport, a business they run now, and not through an employee's link. lib/server/lucky-draw.ts asks the same in
// SQL (tests/security/lucky-draw.test.mjs holds the query); this is the rule the applicant's own page is told by.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DRAW_BUSINESS_STATUS, inTheDraw } from "@/lib/lucky-draw-shared";
import { EVERY_BUSINESS_STATUS } from "@/lib/trip-application";

const IN = { hasPassport: true, businessStatus: "existing_business", referralCode: null, referrerId: null };

test("in the draw: a valid passport, a business run now, no employee's link", () => {
  assert.equal(inTheDraw(IN), true);
  assert.equal(inTheDraw({ ...IN, hasPassport: false }), false, "no valid passport");
  assert.equal(inTheDraw({ ...IN, referralCode: "RAHIM49" }), false, "sent through an employee's link");
  assert.equal(inTheDraw({ ...IN, referrerId: "employee-1" }), false, "credited to an employee");
  assert.equal(inTheDraw({ ...IN, hasPassport: false, businessStatus: "no_business_yet", referralCode: "RAHIM49" }), false);
});

test("of every answer either form offered, only \"Yes, I run a business\" (the older form's \"I currently run a business\")", () => {
  assert.equal(DRAW_BUSINESS_STATUS, "existing_business");
  const inIt = EVERY_BUSINESS_STATUS.filter((s) => inTheDraw({ ...IN, businessStatus: s.value })).map((s) => s.value);
  assert.deepEqual(inIt, ["existing_business"]);
  // Out: "No, not yet", and the older form's "planning to start" and "expanding an existing business" (the owner's choice).
  for (const out of ["no_business_yet", "planning_business", "expanding_business", "", "EXISTING_BUSINESS"]) {
    assert.equal(inTheDraw({ ...IN, businessStatus: out }), false, out || "no answer");
  }
});
