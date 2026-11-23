// The office's Instagram task (2026-11-23): what a username is, when an account is done, what waits for HR, how far a
// person has got and when they are complete. The rules both the server and the pages read (lib/instagram-task-shared.ts).
//   npm run test:instagram-task
import test from "node:test";
import assert from "node:assert/strict";
import {
  INSTAGRAM_DEFAULTS,
  accountDone,
  accountReportedDone,
  accountShare,
  accountToCheck,
  boardTotals,
  checkLine,
  comparePeople,
  countOf,
  instagramLink,
  instagramTaskLine,
  instagramTaskRunning,
  parseInstagramHandle,
  personProgress,
  personState,
} from "../../src/lib/instagram-task-shared.ts";

const rules = INSTAGRAM_DEFAULTS;
const T0 = "2026-11-20T10:00:00.000Z";
const T1 = "2026-11-21T10:00:00.000Z";
const T2 = "2026-11-22T10:00:00.000Z";
const acct = (o = {}) => ({
  posts: 0,
  followers: 0,
  reportedAt: T0,
  checkState: null,
  checkedPosts: null,
  checkedFollowers: null,
  checkedAt: null,
  checkNote: null,
  ...o,
});
const checkedDone = (o = {}) => acct({ posts: 120, followers: 1100, reportedAt: T0, checkState: "checked", checkedPosts: 110, checkedFollowers: 1050, checkedAt: T1, ...o });

test("a username from what was typed or pasted, as Instagram keeps it", () => {
  const ok = {
    "@Affhan.Sourcing": "affhan.sourcing",
    "affhan_123": "affhan_123",
    " NAME ": "name",
    "https://www.instagram.com/Some.User/?igsh=MWx0ZHN1": "some.user",
    "instagram.com/name/": "name",
    "http://instagram.com/name": "name",
    "m.instagram.com/name": "name",
    "https://instagr.am/name": "name",
    "https://www.instagram.com/_u/name/": "name",
    "www.instagram.com/name#top": "name",
    [`${"a".repeat(30)}`]: "a".repeat(30),
  };
  for (const [typed, want] of Object.entries(ok)) assert.equal(parseInstagramHandle(typed), want, typed);
  const not = [
    "", "@", "   ", ".name", "name.", "na..me", "a".repeat(31), "two words", "name/other", "naïve", "na-me", "name!",
    "instagram.com", "https://www.instagram.com/", "instagram.com/p/C0deXyz/", "https://www.instagram.com/reel/Cxyz/",
    "instagram.com/stories/name/3141592653", "instagram.com/explore/tags/food/", "instagram.com/accounts/login/",
    "https://facebook.com/name", "instagram.com/_u/",
  ];
  for (const typed of not) assert.equal(parseInstagramHandle(typed), null, typed);
  assert.equal(instagramLink("some.user"), "https://www.instagram.com/some.user/");
});

test("a count is a whole number from 0, typed or sent", () => {
  assert.equal(countOf("12", 100), 12);
  assert.equal(countOf(" 7 ", 100), 7);
  assert.equal(countOf(0, 100), 0);
  assert.equal(countOf(100, 100), 100);
  for (const bad of [-1, 1.5, "1e3", "", "12a", null, undefined, 101, Number.NaN, "0x10", true]) assert.equal(countOf(bad, 100), null, String(bad));
});

test("only a check makes an account done: the counts it saw, at the task's posts and followers", () => {
  assert.equal(accountDone(checkedDone(), rules), true);
  assert.equal(accountDone(acct({ posts: 500, followers: 5000 }), rules), false, "their own count is a claim, never done");
  assert.equal(accountDone(checkedDone({ checkedFollowers: 999 }), rules), false);
  assert.equal(accountDone(checkedDone({ checkedPosts: 99 }), rules), false);
  assert.equal(accountDone(checkedDone({ checkState: "rejected" }), rules), false);
  assert.equal(accountDone(checkedDone({ checkedPosts: 100, checkedFollowers: 1000 }), rules), true, "reaching it exactly is done");
  assert.equal(accountReportedDone(acct({ posts: 100, followers: 1000 }), rules), true);
  assert.equal(accountReportedDone(acct({ posts: 100, followers: 1000, checkState: "rejected", checkedAt: T1 }), rules), false);
});

test("what waits for HR: a count since the last check, never an empty new account, never one already done", () => {
  assert.equal(accountToCheck(acct(), rules), false, "0 and 0: nothing yet to look at");
  assert.equal(accountToCheck(acct({ posts: 3 }), rules), true);
  assert.equal(accountToCheck(acct({ followers: 40 }), rules), true);
  assert.equal(accountToCheck(acct({ posts: 30, checkState: "checked", checkedPosts: 20, checkedFollowers: 10, checkedAt: T1, reportedAt: T2 }), rules), true);
  assert.equal(accountToCheck(acct({ posts: 30, checkState: "checked", checkedPosts: 20, checkedFollowers: 10, checkedAt: T1, reportedAt: T0 }), rules), false);
  assert.equal(accountToCheck(checkedDone({ reportedAt: T2 }), rules), false, "done stays done whatever is typed next");
  assert.equal(accountToCheck(acct({ posts: 30, checkState: "rejected", checkNote: "Not a new account", checkedAt: T1, reportedAt: T2 }), rules), true, "a new count asks again");
});

test("how far someone has got: half posts, half followers, each capped, over the task's best accounts", () => {
  assert.equal(accountShare(acct({ posts: 50, followers: 500 }), rules), 0.5);
  assert.equal(accountShare(acct({ posts: 500, followers: 0 }), rules), 0.5, "posts past the task count only to the task");
  assert.equal(accountShare(acct({ posts: 100, followers: 1000, checkState: "rejected", checkedAt: T1 }), rules), 0, "turned down counts nothing");
  assert.equal(accountShare(checkedDone({ posts: 0, followers: 0 }), rules), 1, "checked done is all the way, whatever was typed last");
  assert.equal(accountShare(acct({ posts: 10, followers: 100, checkState: "checked", checkedPosts: 50, checkedFollowers: 500, checkedAt: T1 }), rules), 0.5, "what HR saw, when it is further than their count");
  assert.equal(accountShare(acct({ posts: 80, followers: 800, checkState: "checked", checkedPosts: 50, checkedFollowers: 500, checkedAt: T1 }), rules), 0.8, "their count, when it is further than the check");
  const six = [1, 1, 1, 1, 1, 0].map((f) => acct({ posts: 100 * f, followers: 1000 * f }));
  assert.equal(personProgress(six, rules).share, 1, "the best five of six");
  assert.equal(personProgress([acct({ posts: 100, followers: 1000 })], rules).share, 0.2);
  assert.equal(personProgress([], rules).share, 0);
});

test("complete: every account the task asks for checked done, and no more than that counted", () => {
  const four = Array.from({ length: 4 }, () => checkedDone());
  const p4 = personProgress([...four, acct({ posts: 100, followers: 1000, reportedAt: T2 })], rules);
  assert.equal(p4.done, 4);
  assert.equal(p4.complete, false, "the fifth is only their own count");
  assert.equal(p4.reportedDone, 5);
  assert.equal(p4.toCheck, 1);
  const p5 = personProgress([...four, checkedDone()], rules);
  assert.equal(p5.done, 5);
  assert.equal(p5.complete, true);
  assert.equal(p5.toCheck, 0);
  const p6 = personProgress([...four, checkedDone(), checkedDone()], rules);
  assert.equal(p6.done, 5, "done is at most the task's number");
  assert.equal(personProgress([checkedDone(), checkedDone()], { ...rules, accountsPerPerson: 2 }).complete, true);
  assert.equal(personProgress([], { ...rules, accountsPerPerson: 0 }).complete, false, "a task of nothing completes nobody");
  assert.equal(p4.posts, 4 * 120 + 100);
  assert.equal(p4.followers, 4 * 1100 + 1000);
  assert.equal(p4.lastReportAt, T2);
});

test("one word for where someone stands: given, complete, to check, working, not started", () => {
  const done5 = personProgress(Array.from({ length: 5 }, () => checkedDone()), rules);
  assert.equal(personState(done5, true), "prize_given");
  assert.equal(personState(done5, false), "complete");
  assert.equal(personState(personProgress([acct({ posts: 5 })], rules), false), "to_check");
  assert.equal(personState(personProgress([acct()], rules), false), "working");
  assert.equal(personState(personProgress([], rules), false), "not_started");
});

test("the board's figures: prizes given and to give, nothing waiting on someone already given theirs", () => {
  const done5 = Array.from({ length: 5 }, () => checkedDone());
  const people = [
    { prize: { amount: 25000, note: null, givenBy: "Admin", givenAt: T2 }, p: personProgress(done5, rules) },
    { prize: null, p: personProgress(done5, rules) },
    { prize: null, p: personProgress([acct({ posts: 4 }), acct()], rules) },
    { prize: null, p: personProgress([], rules) },
  ];
  const t = boardTotals(people, rules);
  assert.deepEqual(t, { people: 4, started: 3, accounts: 12, done: 10, toCheck: 1, complete: 2, prizesGiven: 1, given: 25000, toGive: 25000 });
});

test("best first: most checked done, then most claimed, then furthest, then by name", () => {
  const p = (accounts) => personProgress(accounts, rules);
  const list = [
    { name: "Zara", p: p([acct({ posts: 100, followers: 1000 })]) },
    { name: "Asha", p: p([checkedDone()]) },
    { name: "Bala", p: p([acct({ posts: 10 })]) },
    { name: "Arun", p: p([acct({ posts: 10 })]) },
    { name: "Mani", p: p([]) },
  ];
  assert.deepEqual(list.sort(comparePeople).map((x) => x.name), ["Asha", "Zara", "Arun", "Bala", "Mani"]);
});

test("the task runs while on and inside its dates; checks never wait on it", () => {
  const at = Date.parse("2026-12-10T06:00:00Z");
  assert.equal(instagramTaskRunning({ enabled: true, startsAt: null, endsAt: null }, at), true);
  assert.equal(instagramTaskRunning({ enabled: false, startsAt: null, endsAt: null }, at), false);
  assert.equal(instagramTaskRunning({ enabled: true, startsAt: "2026-12-11T00:00:00+05:30", endsAt: null }, at), false);
  assert.equal(instagramTaskRunning({ enabled: true, startsAt: null, endsAt: "2026-12-10T00:00:00+05:30" }, at), false);
  assert.equal(instagramTaskRunning({ enabled: true, startsAt: "2026-12-01T00:00:00+05:30", endsAt: "2027-01-01T00:00:00+05:30" }, at), true);
});

test("the words: the task in one line, and a check as its owner reads it", () => {
  assert.equal(instagramTaskLine(rules), "5 accounts · 100 posts and 1,000 followers on each · ₹25,000 prize");
  assert.equal(instagramTaskLine({ ...rules, accountsPerPerson: 1 }), "1 account · 100 posts and 1,000 followers on each · ₹25,000 prize");
  const day = () => "21 Nov";
  assert.equal(checkLine(acct(), rules, day), "Not checked yet");
  assert.equal(checkLine(checkedDone(), rules, day), "Done: checked 21 Nov, 110 posts, 1,050 followers");
  assert.equal(checkLine(checkedDone({ checkedFollowers: 400 }), rules, day), "Checked 21 Nov: 110 posts, 400 followers");
  assert.equal(checkLine(acct({ checkState: "rejected", checkNote: "Not a new account", checkedAt: T1 }), rules, day), "Doesn't count: Not a new account (21 Nov)");
});
