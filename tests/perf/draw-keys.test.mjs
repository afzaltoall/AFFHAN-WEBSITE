// The keys the homepage's draws are made for (src/lib/drawKeys.ts): India's day and ISO week, and what the
// daily refresh makes at 23:30 IST, so that the draw a visitor needs after midnight was made before it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayOf, drawKeys, istDay, weekKey, weekSpan } from "../../src/lib/drawKeys.ts";

const at = (iso) => new Date(iso);

test("the day turns at midnight in India, 18:30 UTC", () => {
  const before = dayOf(at("2026-10-14T18:29:59Z"));
  const after = dayOf(at("2026-10-14T18:30:00Z"));
  assert.equal(after, before + 1);
  assert.equal(istDay(at("2026-10-14T18:29:59Z")).toISOString(), "2026-10-14T00:00:00.000Z");
  assert.equal(istDay(at("2026-10-14T18:30:00Z")).toISOString(), "2026-10-15T00:00:00.000Z");
});

test("the ISO week, as India has it", () => {
  assert.equal(weekKey(at("2026-10-14T06:00:00Z")), "2026-W42");
  // Sunday 23:59 IST is still W42; Monday 00:00 IST is W43.
  assert.equal(weekKey(at("2026-10-18T18:29:59Z")), "2026-W42");
  assert.equal(weekKey(at("2026-10-18T18:30:00Z")), "2026-W43");
  // The first days of January belong to the previous year's last week when that week holds its Thursday.
  assert.equal(weekKey(at("2027-01-01T06:00:00Z")), "2026-W53");
});

test("the week's span, as the band says it", () => {
  assert.equal(weekSpan(at("2026-10-14T06:00:00Z")), "12–18 Oct");
  assert.equal(weekSpan(at("2026-09-30T06:00:00Z")), "28 Sep – 4 Oct");
});

test("the 23:30 IST refresh makes today and tomorrow, and one week midweek", () => {
  const k = drawKeys(at("2026-10-14T18:00:00Z")); // Wednesday, 23:30 IST
  assert.deepEqual(k.days, [dayOf(at("2026-10-14T06:00:00Z")), dayOf(at("2026-10-15T06:00:00Z"))]);
  assert.deepEqual(k.weeks, [{ key: "2026-W42", span: "12–18 Oct" }]);
});

test("on a Sunday it makes next week's grid too", () => {
  const k = drawKeys(at("2026-10-18T18:00:00Z")); // Sunday, 23:30 IST
  assert.deepEqual(
    k.weeks.map((w) => w.key),
    ["2026-W42", "2026-W43"],
  );
  assert.equal(k.weeks[1].span, "19–25 Oct");
});

test("after midnight IST, today's key is the day the 23:30 run called tomorrow", () => {
  const evening = drawKeys(at("2026-10-14T18:00:00Z"));
  const pastMidnight = dayOf(at("2026-10-14T19:00:00Z")); // 00:30 IST on the 15th
  assert.equal(pastMidnight, evening.days[1]);
});
