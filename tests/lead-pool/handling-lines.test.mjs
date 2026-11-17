// The console's Handling history in plain words (src/lib/handling-lines.ts; the owner, 2026-11-17: "handling history
// is too complex, the UI is not good"): what the request's customer read goes under the step that caused it, and
// under no other: never under an arrival that happened the same minute, never twice under one step.
//   npm run test:lead-pool
import { test } from "node:test";
import assert from "node:assert/strict";
import { linesOf } from "../../src/lib/handling-lines.ts";

const at = (sec) => new Date(Date.UTC(2026, 10, 17, 5, 0, 0) + sec * 1000).toISOString();
const step = (sec, kind, { label = kind, who = null, note = null } = {}) => ({ at: at(sec), kind, label, who, note });
const told = (sec, code, who = "Admin", note = null) => step(sec, "CUSTOMER", { label: code, who, note });
const marked = (by) => `every request marked Handled, Spam or deleted (marked by ${by}): out of the pool`;
const again = (by) => `a request to deal with again (marked by ${by}): back in the pool for a new week`;
/** Each line as [what, who, [what the customer read under it]]. */
const view = (steps) => linesOf(steps).map((l) => [l.outcome ?? l.title, l.who, l.told.map((x) => (x.note ? `${x.text}: ${x.note}` : x.text))]);

test("Handled: the customer's Checked goes under Marked done, though it was saved a moment before it", () => {
  assert.deepEqual(view([step(0, "ARRIVED"), told(60, "CHECKED"), step(61, "DONE", { note: marked("Admin") })]), [
    ["Request arrived", null, []],
    ["Marked done", "by Admin", ["Customer now sees Checked"]],
  ]);
});

test("New again: Received goes under Set to New again, saved either side of it, and the console's own note is not shown", () => {
  const base = [step(0, "ARRIVED"), told(60, "CHECKED"), step(61, "DONE", { note: marked("Admin") })];
  const expected = [
    ["Request arrived", null, []],
    ["Marked done", "by Admin", ["Customer now sees Checked"]],
    ["Set to New again", "by Admin", ["Customer now sees Received"]],
  ];
  assert.deepEqual(view([...base, told(300, "PENDING", "Admin", "Set to New again"), step(301, "REOPENED", { note: again("Admin") })]), expected);
  assert.deepEqual(view([...base, step(300, "REOPENED", { note: again("Admin") }), told(301, "PENDING", "Admin", "Set to New again")]), expected);
});

test("Closed from the popup: the reason goes under the Marked done the same press made", () => {
  const why = "We couldn't source this product.";
  assert.deepEqual(view([step(0, "ARRIVED"), told(60, "CLOSED", "Admin", why), step(61, "DONE", { note: marked("Admin") })]), [
    ["Request arrived", null, []],
    ["Marked done", "by Admin", [`Customer now sees Closed: ${why}`]],
  ]);
});

test("a status set the minute another request arrived is not that arrival's doing: it stands by itself", () => {
  // As the release gate's own run did: a second request, then the team's presses, all inside the minute.
  assert.deepEqual(view([step(0, "ARRIVED"), step(10, "JOINED"), told(20, "CHECKED"), told(30, "CONFIRMED")]), [
    ["Request arrived", null, []],
    ["Another request arrived", null, []],
    ["Customer now sees Checked", "by Admin", []],
    ["Customer now sees Confirmed", "by Admin", []],
  ]);
  assert.deepEqual(view([step(0, "ARRIVED"), told(5, "CONFIRMED")]), [
    ["Request arrived", null, []],
    ["Customer now sees Confirmed", "by Admin", []],
  ]);
  // Back in the pool because the customer asked again (not the console's New) causes nothing either.
  assert.deepEqual(view([step(0, "REOPENED", { note: "Phone case: back in the pool for a new week" }), told(5, "CHECKED")]), [
    ["Another request arrived", null, []],
    ["Customer now sees Checked", "by Admin", []],
  ]);
});

test("one move a step: Confirmed pressed after Handled is a line of its own", () => {
  assert.deepEqual(view([step(0, "ARRIVED"), told(60, "CHECKED"), step(61, "DONE", { note: marked("Admin") }), told(80, "CONFIRMED")]), [
    ["Request arrived", null, []],
    ["Marked done", "by Admin", ["Customer now sees Checked"]],
    ["Customer now sees Confirmed", "by Admin", []],
  ]);
});

test("a move by somebody else, or minutes later, is never put under another's step", () => {
  assert.deepEqual(view([step(61, "DONE", { note: marked("Admin") }), told(62, "CHECKED", "Ravi")]), [
    ["Marked done", "by Admin", []],
    ["Customer now sees Checked", "by Ravi", []],
  ]);
  assert.deepEqual(view([told(0, "CHECKED"), step(600, "DONE", { note: marked("Admin") })]), [
    ["Customer now sees Checked", "by Admin", []],
    ["Marked done", "by Admin", []],
  ]);
});

test("a salesperson's Lead: the Checked it caused goes under one of their own steps, once", () => {
  const lines = linesOf([
    step(0, "ARRIVED"),
    step(100, "TAKEN", { who: "Priya" }),
    step(400, "STATUS", { label: "LEAD", who: "Priya" }),
    step(401, "RESOLVED", { who: "Priya", note: "became business" }),
    told(402, "CHECKED", "Priya"),
    step(403, "REQUESTS_CLOSED", { who: "Priya", note: "closed by Priya: 1 request marked Handled" }),
  ]);
  const under = lines.filter((l) => l.told.length);
  assert.equal(under.length, 1);
  assert.equal(under[0].who, "by Priya");
  assert.deepEqual(under[0].told.map((x) => x.text), ["Customer now sees Checked"]);
  assert.ok(!lines.some((l) => l.title.startsWith("Customer now sees")), "nothing left standing by itself");
  assert.equal(lines.find((l) => l.outcome)?.outcome, "LEAD");
});
