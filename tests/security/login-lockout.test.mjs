// H5 (security audit 2026-10-08): five failures lock a sign-in for 15 minutes, each five after that for twice as long.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lockedMessage, lockedUntil, waitPhrase, LOCKOUT_FIRST_MS, LOCKOUT_LONGEST_MS } from "../../src/lib/login-lockout.ts";

const MIN = 60_000;
const T = Date.UTC(2026, 9, 8, 12, 0, 0);
/** `n` failures one second apart, the last at `last`. */
const failures = (n, last = T) => Array.from({ length: n }, (_, i) => last - (n - 1 - i) * 1000);

test("fewer than five failures: no lock", () => {
  assert.equal(lockedUntil([], T), null);
  assert.equal(lockedUntil(failures(4), T), null);
});

test("the fifth failure locks for fifteen minutes from that failure", () => {
  assert.equal(lockedUntil(failures(5), T), T + LOCKOUT_FIRST_MS);
  assert.equal(lockedUntil(failures(5), T + 14 * MIN), T + LOCKOUT_FIRST_MS, "still locked at 14 minutes");
  assert.equal(lockedUntil(failures(5), T + 15 * MIN), null, "open again at 15");
});

test("after a lock, the next four failures do not lock; the tenth locks for thirty minutes", () => {
  const first = failures(5, T);
  const later = (n) => [...first, ...failures(n, T + 20 * MIN)];
  assert.equal(lockedUntil(later(4), T + 20 * MIN), null);
  assert.equal(lockedUntil(later(5), T + 20 * MIN), T + 20 * MIN + 2 * LOCKOUT_FIRST_MS);
});

test("each five after that doubles the wait, up to a day", () => {
  assert.equal(lockedUntil(failures(15), T) - T, 60 * MIN);
  assert.equal(lockedUntil(failures(20), T) - T, 120 * MIN);
  assert.equal(lockedUntil(failures(40), T) - T, LOCKOUT_LONGEST_MS, "15 min x 2^7 is 32 hours, held to 24");
  assert.equal(lockedUntil(failures(500), T) - T, LOCKOUT_LONGEST_MS);
});

test("a burst sent at once is locked as surely as guesses sent one by one", () => {
  const burst = Array.from({ length: 12 }, () => T);
  assert.equal(lockedUntil(burst, T), T + 2 * LOCKOUT_FIRST_MS);
});

test("the wait reads as a sign-in form would say it, rounded up", () => {
  assert.equal(waitPhrase(15 * MIN), "15 minutes");
  assert.equal(waitPhrase(14 * MIN + 1), "15 minutes");
  assert.equal(waitPhrase(1), "1 minute");
  assert.equal(waitPhrase(30 * MIN), "30 minutes");
  assert.equal(waitPhrase(60 * MIN), "1 hour");
  assert.equal(waitPhrase(119 * MIN), "2 hours");
  assert.equal(waitPhrase(LOCKOUT_LONGEST_MS), "24 hours");
});

test("a locked sign-in says how long, and that a reset unlocks it now (the owner's words, 2026-10-09)", () => {
  assert.equal(lockedMessage(15 * MIN), "Too many wrong attempts. Try again in 15 minutes, or reset your password to unlock now.");
  assert.equal(lockedMessage(90 * MIN), "Too many wrong attempts. Try again in 2 hours, or reset your password to unlock now.");
});
