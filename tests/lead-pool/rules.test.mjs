// The open pool's rules without a database (src/lib/lead-pool-rules.ts, office-hours.ts, handling.ts): the office
// clock the pool runs on, its deadlines, who may take a customer back and when, and what a console row says. The
// same rules against a running build, with the pool's sweep on a test clock, are the gate's end-to-end run.
//   npm run test:lead-pool
import { test } from "node:test";
import assert from "node:assert/strict";
import { addOfficeMinutes, isOfficeOpen, officeMinutesBetween, startOfNextOfficeDay } from "../../src/lib/office-hours.ts";
import {
  ASSIGN_GONE, LEAVE_KINDS, POOL_EVENT, POOL_STATE, SETTLED_TRIAGE, closedByNote, firstName, isFinalOutcome, needsHandling,
  placeOnFile, poolKindLabel, releaseDeadline, retakeAllowedFrom, staffWord, staleDeadline, triageMove, weekEnds,
} from "../../src/lib/lead-pool-rules.ts";
import { MAX_OPEN_LEADS, RELEASE_AFTER_OFFICE_MINUTES, STALE_IN_PROGRESS_OFFICE_DAYS } from "../../src/lib/lead-pool-config.ts";
import {
  handlingKey, handlingText, heldByMessage, heldByOf, heldRefusal, heldSince, matchesHandling, span, waitingRank,
} from "../../src/lib/handling.ts";
import { askedFor, capitalized, customerLabel, poolLabel } from "../../src/lib/customer-label.ts";

/** A moment in the office's own time: ist("2026-10-19 17:30") is Monday 19 October, 5:30 PM in Chennai. */
const ist = (s) => new Date(`${s.replace(" ", "T")}:00+05:30`);
const iso = (s) => ist(s).toISOString();
const MIN = 60_000;

// 18 October 2026 is a Sunday, so the 19th is a Monday and the 24th a Saturday.
test("the calendar these tests stand on", () => {
  assert.equal(ist("2026-10-18 12:00").getUTCDay(), 0);
  assert.equal(ist("2026-10-19 12:00").getUTCDay(), 1);
  assert.equal(ist("2026-10-24 12:00").getUTCDay(), 6);
});

test("the numbers are the owner's", () => {
  assert.equal(MAX_OPEN_LEADS, 10);
  assert.equal(RELEASE_AFTER_OFFICE_MINUTES, 120);
  assert.equal(STALE_IN_PROGRESS_OFFICE_DAYS, 2);
});

test("office hours: Monday to Saturday, 09:30 to 18:30 IST", () => {
  assert.equal(isOfficeOpen(ist("2026-10-19 09:29")), false);
  assert.equal(isOfficeOpen(ist("2026-10-19 09:30")), true);
  assert.equal(isOfficeOpen(ist("2026-10-19 18:29")), true);
  assert.equal(isOfficeOpen(ist("2026-10-19 18:30")), false);
  assert.equal(isOfficeOpen(ist("2026-10-24 12:00")), true);
  assert.equal(isOfficeOpen(ist("2026-10-25 12:00")), false);
});

test("office minutes between two moments skip the night and the Sunday", () => {
  // An hour on Monday evening and an hour on Tuesday morning; the night between counts nothing.
  assert.equal(officeMinutesBetween(ist("2026-10-19 17:30"), ist("2026-10-20 10:30")), 120);
  // Saturday evening to Monday morning, across the Sunday.
  assert.equal(officeMinutesBetween(ist("2026-10-24 17:30"), ist("2026-10-26 10:30")), 120);
  // From after closing to half an hour after opening.
  assert.equal(officeMinutesBetween(ist("2026-10-20 20:00"), ist("2026-10-21 10:00")), 30);
  // All of a Sunday, and a moment's wrong way round, are nothing.
  assert.equal(officeMinutesBetween(ist("2026-10-25 10:00"), ist("2026-10-25 17:00")), 0);
  assert.equal(officeMinutesBetween(ist("2026-10-21 12:00"), ist("2026-10-21 11:00")), 0);
  // A whole office week: six days of nine hours.
  assert.equal(officeMinutesBetween(ist("2026-10-19 00:00"), ist("2026-10-26 00:00")), 6 * 9 * 60);
});

test("office minutes between is the inverse of adding them", () => {
  const starts = ["2026-10-19 08:00", "2026-10-19 09:30", "2026-10-19 13:17", "2026-10-19 18:29", "2026-10-24 17:00", "2026-10-25 11:00"];
  for (const s of starts) {
    for (const m of [1, 45, 120, 540, 541, 1080, 3000]) {
      assert.equal(officeMinutesBetween(ist(s), addOfficeMinutes(ist(s), m)), m, `${s} + ${m}`);
    }
  }
});

test("a customer taken goes back after two office hours with nothing recorded, never overnight or on a Sunday", () => {
  assert.equal(releaseDeadline(ist("2026-10-19 11:00")).toISOString(), iso("2026-10-19 13:00"));
  // Three quarters of an hour on Monday, the rest on Tuesday morning.
  assert.equal(releaseDeadline(ist("2026-10-19 17:45")).toISOString(), iso("2026-10-20 10:45"));
  // Half an hour on Saturday, an hour and a half on Monday.
  assert.equal(releaseDeadline(ist("2026-10-24 18:00")).toISOString(), iso("2026-10-26 11:00"));
  // Taken on a Sunday or at night: the clock starts at the next opening.
  assert.equal(releaseDeadline(ist("2026-10-25 12:00")).toISOString(), iso("2026-10-26 11:30"));
  assert.equal(releaseDeadline(ist("2026-10-20 22:00")).toISOString(), iso("2026-10-21 11:30"));
});

test("In progress goes back after two quiet office days", () => {
  assert.equal(staleDeadline(ist("2026-10-20 15:00")).toISOString(), iso("2026-10-22 15:00"));
  // Friday afternoon: Saturday is a working day, Sunday is not.
  assert.equal(staleDeadline(ist("2026-10-23 15:00")).toISOString(), iso("2026-10-26 15:00"));
});

test("whoever a customer left may take them back from the next office day; the week runs seven days", () => {
  assert.equal(retakeAllowedFrom(ist("2026-10-20 15:00")).toISOString(), iso("2026-10-21 09:30"));
  assert.equal(retakeAllowedFrom(ist("2026-10-24 17:00")).toISOString(), iso("2026-10-26 09:30"));
  assert.equal(retakeAllowedFrom(ist("2026-10-20 23:30")).toISOString(), iso("2026-10-21 09:30"));
  // Just after midnight it is already Wednesday, so the next office day is Thursday.
  assert.equal(retakeAllowedFrom(ist("2026-10-21 00:30")).toISOString(), iso("2026-10-22 09:30"));
  assert.equal(startOfNextOfficeDay(ist("2026-10-25 10:00")).toISOString(), iso("2026-10-26 09:30"));
  assert.equal(weekEnds(ist("2026-10-19 10:00")).toISOString(), iso("2026-10-26 10:00"));
  // Release, auto-release and Not attended start the wait; an administrator's release does not.
  assert.deepEqual([...LEAVE_KINDS].sort(), ["AUTO_RELEASED", "NOT_ATTENDED", "RELEASED"]);
  assert.ok(!LEAVE_KINDS.includes(POOL_EVENT.ADMIN_UNASSIGNED));
});

test("only Lead, No lead and Invalid end a customer's open life", () => {
  for (const s of ["LEAD", "NO_LEAD", "INVALID", "CONVERTED", "NOT_CONVERTED"]) assert.equal(isFinalOutcome(s), true, s);
  for (const s of ["IN_PROGRESS", "NOT_ATTENDED", "FOLLOW_UP", "", null, undefined]) assert.equal(isFinalOutcome(s), false, String(s));
});

// ---- already handled stays out of the pool (the owner, 2026-10-22) -----------------------------------------------------

test("a request needs handling unless the console marks it Handled, Spam or deleted", () => {
  assert.deepEqual([...SETTLED_TRIAGE].sort(), ["deleted", "handled", "spam"]);
  for (const s of ["handled", "spam", "deleted", "Handled", " SPAM "]) assert.equal(needsHandling(s), false, s);
  // New, and anything the console does not call settled, still needs somebody.
  for (const s of ["new", "NEW", "", null, undefined, "something else"]) assert.equal(needsHandling(s), true, String(s));
});

test("at the switch: decided stays decided, nothing left to handle is Done, otherwise held or into the pool", () => {
  const P = (decided, needs, held) => placeOnFile({ decided, needsHandling: needs, held });
  assert.equal(P(true, true, true), POOL_STATE.RESOLVED);
  assert.equal(P(true, false, false), POOL_STATE.RESOLVED);
  // Held by somebody, but every request already handled: Done, not held, so never auto-released into the pool.
  assert.equal(P(false, false, true), POOL_STATE.DONE);
  assert.equal(P(false, false, false), POOL_STATE.DONE);
  assert.equal(P(false, true, true), POOL_STATE.HELD);
  assert.equal(P(false, true, false), POOL_STATE.OPEN);
});

test("after it, the console's triage moves customers out of the pool and back", () => {
  assert.equal(triageMove(POOL_STATE.OPEN, false), "set-aside");
  assert.equal(triageMove(POOL_STATE.HELD, false), "set-aside");
  assert.equal(triageMove(POOL_STATE.DONE, true), "reopen");
  assert.equal(triageMove(POOL_STATE.OPEN, true), null);
  assert.equal(triageMove(POOL_STATE.HELD, true), null);
  assert.equal(triageMove(POOL_STATE.DONE, false), null);
  // Decided and given up on stay where they are, whatever the console marks.
  for (const s of [POOL_STATE.RESOLVED, POOL_STATE.INVALID]) {
    assert.equal(triageMove(s, true), null, s);
    assert.equal(triageMove(s, false), null, s);
  }
});

test("Already taken by: the first name, or somebody", () => {
  assert.equal(firstName("Priya Raman"), "Priya");
  assert.equal(firstName("  Karan  "), "Karan");
  assert.equal(firstName(null), "somebody");
  assert.equal(firstName(""), "somebody");
});

test("every event the pool writes has the office's words, and the old assign says where it went", () => {
  for (const kind of Object.values(POOL_EVENT)) {
    const label = poolKindLabel(kind);
    assert.ok(label && label !== kind.replace(/_/g, " ").toLowerCase(), `${kind}: ${label}`);
  }
  // The Queue page has gone (2026-10-22): the one control left is in the customer's popup.
  assert.match(ASSIGN_GONE, /Release to pool in their popup/);
  assert.doesNotMatch(ASSIGN_GONE, /Queue/);
});

// 2026-10-22, the owner: Lead or No lead closes the customer's open requests, and the trail says who.
test("Lead or No lead closing a customer's requests: the trail's words name who closed them", () => {
  assert.equal(poolKindLabel(POOL_EVENT.REQUESTS_CLOSED), "Requests marked Handled");
  // The rotation wrote CLOSED when a customer had no leads left; older trails keep their own word.
  assert.equal(poolKindLabel("CLOSED"), "Closed");
  assert.equal(closedByNote("Alpha Tester", 1), "closed by Alpha Tester: 1 request marked Handled");
  assert.equal(closedByNote("Alpha Tester", 3), "closed by Alpha Tester: 3 requests marked Handled");
});

// ---- what a console row says (real clock times; Team Performance's averages are the office-hours ones) -------------

const priya = { id: "e1", name: "Priya" };

test("an open row says how long it has waited, and its title when the week runs out", () => {
  const now = ist("2026-10-19 12:35").getTime();
  const open = handlingText({ state: "open", since: iso("2026-10-19 12:00"), until: iso("2026-10-26 12:00") }, iso("2026-10-19 11:00"), now);
  assert.equal(open.text, "Open · waiting 35m");
  assert.equal(open.title, "In the pool since 19 Oct 2026, 12:00 PM · given up on 26 Oct 2026, 12:00 PM if nobody takes them");
  // No place in the pool yet (before the first sweep): waiting since it arrived.
  assert.equal(handlingText(null, iso("2026-10-19 10:05"), now).text, "Open · waiting 2h 30m");
});

// 2026-10-22, the owner: what the Queue page showed (who holds whom, time left before auto-release) is on the chip.
test("a held row says who, and when they go back to the pool by themselves", () => {
  const taken = { state: "held", by: priya, takenAt: iso("2026-10-19 10:42"), status: null, releaseAt: iso("2026-10-19 12:42"), clock: "silent" };
  const silent = handlingText(taken, iso("2026-10-19 09:00"), ist("2026-10-19 11:32").getTime());
  assert.equal(silent.text, "Taken by Priya · auto-release in 1h 10m");
  assert.equal(silent.title, "Taken 19 Oct 2026, 10:42 AM · back to the pool 19 Oct 2026, 12:42 PM if nothing is recorded");
  // In progress: two office days of nothing newer, with the outcome on the chip too.
  const working = { ...taken, status: "IN_PROGRESS", releaseAt: iso("2026-10-21 12:00"), clock: "stale" };
  const stale = handlingText(working, iso("2026-10-19 09:00"), ist("2026-10-19 10:00").getTime());
  assert.equal(stale.text, "Taken by Priya · In progress · auto-release in 2d 2h");
  assert.match(stale.title, /back to the pool 21 Oct 2026, 12:00 PM unless something newer is recorded$/);
  // Past the moment: the next sweep releases them while the office is open, else the first one after it opens.
  assert.equal(handlingText(taken, iso("2026-10-19 09:00"), ist("2026-10-19 12:50").getTime()).text, "Taken by Priya · auto-release due");
  assert.equal(isOfficeOpen(ist("2026-10-19 19:00")), false);
  assert.equal(
    handlingText({ ...taken, releaseAt: iso("2026-10-19 18:20") }, iso("2026-10-19 09:00"), ist("2026-10-19 19:00").getTime()).text,
    "Taken by Priya · auto-release when the office opens, 20 Oct, 9:30 AM",
  );
  // No clock at all, which the sweep's rules leave only for odd cases on file before the switch.
  assert.equal(handlingText({ ...taken, releaseAt: null, clock: null }, iso("2026-10-19 09:00"), ist("2026-10-19 12:00").getTime()).text, "Taken by Priya · no auto-release");
  // The popup's line beside Release to pool; across a night the time gains its date.
  assert.equal(heldSince(taken, ist("2026-10-19 12:00").getTime()), "Held by Priya since 10:42 AM");
  assert.equal(heldSince({ ...taken, takenAt: iso("2026-10-19 17:00") }, ist("2026-10-20 10:00").getTime()), "Held by Priya since 19 Oct, 5:00 PM");
});

test("a decided row says the outcome, who, and how long from taking it, across a Sunday too", () => {
  const h = { state: "done", outcome: "LEAD", by: priya, takenAt: iso("2026-10-19 10:00"), doneAt: iso("2026-10-19 12:10") };
  assert.equal(handlingText(h, iso("2026-10-19 09:00")).text, "Lead by Priya · took 2h 10m");
  // Friday 17:00 to Monday 10:00 is 65 real hours.
  const weekend = { state: "done", outcome: "NO_LEAD", by: priya, takenAt: iso("2026-10-23 17:00"), doneAt: iso("2026-10-26 10:00") };
  assert.equal(handlingText(weekend, iso("2026-10-23 09:00")).text, "No lead by Priya · took 2d 17h");
  // Decided before the switch, with no Take on the trail.
  assert.equal(handlingText({ ...h, takenAt: null }, iso("2026-10-19 09:00")).text, "Lead by Priya");
});

test("a customer set aside as already handled reads Done, and is counted and sorted with the done ones", () => {
  const h = { state: "handled", at: iso("2026-10-22 19:43") };
  assert.equal(handlingText(h, iso("2026-09-21 10:00")).text, "Done · already handled");
  assert.match(handlingText(h, iso("2026-09-21 10:00")).title, /every request is marked Handled, Spam or deleted/);
  assert.equal(handlingKey(h), "done");
  assert.equal(matchesHandling(h, "done"), true);
  assert.equal(matchesHandling(h, "open"), false);
  assert.equal(waitingRank(h, iso("2026-09-21 10:00"))[0], 2);
});

// 2026-10-22, the owner: the person holding a customer closes them; the console says so instead of marking Handled.
test("Handled on a held customer: the console and the server say who will close it", () => {
  const raman = { state: "held", by: { id: "e1", name: "Priya Raman" }, takenAt: iso("2026-10-19 10:00"), status: null };
  const karan = { state: "held", by: { id: "e2", name: "Karan" }, takenAt: iso("2026-10-19 11:00"), status: "IN_PROGRESS" };
  const open = { state: "open", since: iso("2026-10-19 09:00") };
  const decided = { state: "done", outcome: "LEAD", by: priya, takenAt: null, doneAt: iso("2026-10-19 12:00") };
  assert.equal(heldByMessage(["Priya Raman"]), "Held by Priya Raman — they will close it");
  // Several people in alphabetical order, so the console and the server agree; each named once.
  assert.equal(heldByMessage(["Priya Raman", "Karan"], 2), "Held by Karan and Priya Raman — they will close them");
  assert.equal(heldByMessage(["C", "A", "B", "A"], 4), "Held by A, B and C — they will close them");
  assert.equal(heldByMessage(["Priya Raman", "Priya Raman"], 2), "Held by Priya Raman — they will close them");
  assert.equal(heldByMessage([""]), "Held by somebody — they will close it");
  // One row.
  assert.equal(heldByOf(raman), "Held by Priya Raman — they will close it");
  for (const h of [open, decided, null, undefined]) assert.equal(heldByOf(h), null);
  // A selection: customers, not rows; nobody held, nothing refused.
  assert.equal(
    heldRefusal([{ key: "k1", handling: raman }, { key: "k1", handling: raman }, { key: "k2", handling: open }]),
    "Held by Priya Raman — they will close it",
  );
  assert.equal(heldRefusal([{ key: "k3", handling: karan }, { key: "k1", handling: raman }]), "Held by Karan and Priya Raman — they will close them");
  assert.equal(heldRefusal([{ key: "k2", handling: open }, { key: "k4", handling: decided }, { key: "k5", handling: null }]), null);
});

test("an invalid row says why", () => {
  const h = { state: "invalid", reason: "a week in the pool, unhandled", at: iso("2026-10-26 10:00") };
  assert.equal(handlingText(h, iso("2026-10-19 09:00")).text, "Invalid · a week in the pool, unhandled");
});

test("the filters and the longest-wait order", () => {
  const open = { state: "open", since: iso("2026-10-19 09:00") };
  const older = { state: "open", since: iso("2026-10-18 09:00") };
  const held = { state: "held", by: priya, takenAt: iso("2026-10-19 08:00"), status: null };
  const done = { state: "done", outcome: "LEAD", by: priya, takenAt: null, doneAt: iso("2026-10-19 11:00") };
  const doneLater = { state: "done", outcome: "NO_LEAD", by: priya, takenAt: null, doneAt: iso("2026-10-19 12:00") };
  const invalid = { state: "invalid", reason: "x", at: iso("2026-10-19 10:00") };
  assert.equal(handlingKey(null), "open");
  assert.equal(matchesHandling(null, "open"), true);
  assert.equal(matchesHandling(held, "open"), false);
  assert.equal(matchesHandling(held, "all"), true);
  assert.equal(matchesHandling(invalid, "invalid"), true);
  const rows = [doneLater, held, open, invalid, done, older];
  const sorted = [...rows].sort((a, b) => {
    const [ra, ta] = waitingRank(a, iso("2026-10-19 09:00"));
    const [rb, tb] = waitingRank(b, iso("2026-10-19 09:00"));
    return ra - rb || ta - tb;
  });
  // Waiting longest first; then held longest first; then the finished ones, newest first.
  assert.deepEqual(sorted, [older, open, held, doneLater, done, invalid]);
});

test("durations in words", () => {
  assert.equal(span(0), "0m");
  assert.equal(span(59 * MIN), "59m");
  assert.equal(span(60 * MIN), "1h 0m");
  assert.equal(span(47 * 60 * MIN + 59 * MIN), "47h 59m");
  assert.equal(span(48 * 60 * MIN), "2d 0h");
  assert.equal(span(-5 * MIN), "0m");
});

// ---- naming a customer, and a member of staff, in a lead action or message (the owner, 2026-10-22) -----------------

test("a customer is always 'customer <name>' with what they asked for; before Take, their AFFHAN number", () => {
  const tee = { kind: "inquiry", title: "O-neck T-Shirt" };
  const mug = { kind: "inquiry", title: "Ceramic Mug" };
  const message = { kind: "contact", title: "Siddiq" }; // a message's title is the sender's own name: never shown
  const freight = { kind: "shipment", title: null };
  assert.equal(customerLabel("Siddiq", [tee, message]), "customer Siddiq (O-neck T-Shirt + 1 more)");
  assert.equal(customerLabel("Siddiq", [tee]), "customer Siddiq (O-neck T-Shirt)");
  // Their first product, wherever it comes in the list; else what their first request is.
  assert.equal(askedFor([message, mug, tee]), "Ceramic Mug + 2 more");
  assert.equal(askedFor([message]), "Contact message");
  assert.equal(askedFor([freight, message]), "Freight request + 1 more");
  assert.equal(askedFor([]), "");
  assert.equal(customerLabel("  Siddiq  ", []), "customer Siddiq");
  assert.equal(customerLabel("", [tee]), "this customer (O-neck T-Shirt)");
  // The pool may not name anybody before Take.
  assert.equal(poolLabel("AFFHAN-0123", [tee]), "AFFHAN-0123 (O-neck T-Shirt)");
  assert.equal(poolLabel(null, [tee, mug]), "this customer (O-neck T-Shirt + 1 more)");
  assert.equal(`Take ${poolLabel("AFFHAN-0123", [tee])}`, "Take AFFHAN-0123 (O-neck T-Shirt)");
  // At the start of a sentence.
  assert.equal(`${capitalized(customerLabel("Siddiq", [tee]))} is back in the open pool.`, "Customer Siddiq (O-neck T-Shirt) is back in the open pool.");
  assert.equal(`${capitalized(poolLabel("AFFHAN-0123", [tee]))} was already taken by Khaja.`, "AFFHAN-0123 (O-neck T-Shirt) was already taken by Khaja.");
});

test("a member of staff on the trail is 'by' whoever did it, 'held by' whoever had the customer", () => {
  for (const kind of [POOL_EVENT.TAKEN, POOL_EVENT.RELEASED, POOL_EVENT.NOT_ATTENDED, POOL_EVENT.RESOLVED, POOL_EVENT.REQUESTS_CLOSED, POOL_EVENT.HELD]) {
    assert.equal(staffWord(kind), "by", kind);
  }
  // Moved by the pool, the console or an administrator, or joined by a new request: the person who had them.
  for (const kind of [POOL_EVENT.AUTO_RELEASED, POOL_EVENT.ADMIN_UNASSIGNED, POOL_EVENT.INVALIDATED, POOL_EVENT.DONE, POOL_EVENT.SWITCHED, POOL_EVENT.JOINED]) {
    assert.equal(staffWord(kind), "held by", kind);
  }
  assert.equal(staffWord(POOL_EVENT.ADMIN_ASSIGNED), "to");
  assert.equal(staffWord("MANUAL_ASSIGN"), "to");
});
