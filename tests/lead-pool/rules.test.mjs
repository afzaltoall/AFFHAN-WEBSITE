// The open pool's rules without a database (src/lib/lead-pool-rules.ts, office-hours.ts, handling.ts): the office
// clock the pool runs on, its deadlines, who may take a customer back and when, and what a console row says. The
// same rules against a running build, with the pool's sweep on a test clock, are the gate's end-to-end run.
//   npm run test:lead-pool
import { test } from "node:test";
import assert from "node:assert/strict";
import { addOfficeMinutes, isOfficeOpen, officeMinutesBetween, startOfNextOfficeDay } from "../../src/lib/office-hours.ts";
import {
  ASSIGN_GONE, LEAVE_KINDS, POOL_EVENT, firstName, isFinalOutcome, poolKindLabel, releaseDeadline, retakeAllowedFrom,
  staleDeadline, weekEnds,
} from "../../src/lib/lead-pool-rules.ts";
import { MAX_OPEN_LEADS, RELEASE_AFTER_OFFICE_MINUTES, STALE_IN_PROGRESS_OFFICE_DAYS } from "../../src/lib/lead-pool-config.ts";
import { handlingKey, handlingText, matchesHandling, span, waitingRank } from "../../src/lib/handling.ts";

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
  assert.match(ASSIGN_GONE, /Release to pool on the Queue page/);
});

// ---- what a console row says (real clock times; Team Performance's averages are the office-hours ones) -------------

const priya = { id: "e1", name: "Priya" };

test("an open row says how long it has waited", () => {
  const now = ist("2026-10-19 12:35").getTime();
  assert.equal(handlingText({ state: "open", since: iso("2026-10-19 12:00") }, iso("2026-10-19 11:00"), now).text, "Open · waiting 35m");
  // No place in the pool yet (before the first sweep): waiting since it arrived.
  assert.equal(handlingText(null, iso("2026-10-19 10:05"), now).text, "Open · waiting 2h 30m");
});

test("a held row says who, when they took it, how long, and the newest outcome", () => {
  const h = { state: "held", by: priya, takenAt: iso("2026-10-19 10:42"), status: "IN_PROGRESS" };
  assert.equal(handlingText(h, iso("2026-10-19 09:00"), ist("2026-10-19 12:02").getTime()).text, "Taken by Priya · 10:42 AM · held 1h 20m · In progress");
  // Across a night the clock time gains its date, and the hold is the real seventeen hours.
  const evening = { state: "held", by: priya, takenAt: iso("2026-10-19 17:00"), status: null };
  assert.equal(
    handlingText(evening, iso("2026-10-19 09:00"), ist("2026-10-20 10:00").getTime()).text,
    "Taken by Priya · 19 Oct, 5:00 PM · held 17h 0m · nothing recorded yet",
  );
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
