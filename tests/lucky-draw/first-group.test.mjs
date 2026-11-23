// Seats 1 to 3 of every round from the first 1,540 applications, seats 4 and 5 from everyone (the owner, 2026-11-23;
// the trip's Terms, clause 3, say so). The server draws from the group of the seat a press will fill, worked out as the
// board works out seats (src/lib/lucky-draw-shared.ts: seatOfNextDraw, seatFromFirstGroup, inFirstGroup).
//   npm run test:lucky-draw
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIRST_GROUP_FROM, FIRST_GROUP_SEATS, FIRST_GROUP_TO, inFirstGroup, seatDraws, seatFromFirstGroup, seatOfNextDraw } from "@/lib/lucky-draw-shared";

const T0 = Date.UTC(2026, 10, 25, 12, 0, 0);
const at = (s) => new Date(T0 + s * 1000).toISOString();
const draw = (number, released = null, removed = false) => ({ id: `d${number}`, number, drawnAt: at(number * 10), releasedAt: released === null ? null : at(released), removed });
const NOW = at(10_000);

test("the group: Trip IDs TRIP-26-00001 to TRIP-26-01540, for seats 1 to 3", () => {
  assert.equal(FIRST_GROUP_SEATS, 3);
  assert.equal(FIRST_GROUP_FROM, "TRIP-26-00001");
  assert.equal(FIRST_GROUP_TO, "TRIP-26-01540");
  for (const id of ["TRIP-26-00001", "TRIP-26-00777", "TRIP-26-01539", "TRIP-26-01540"]) assert.equal(inFirstGroup(id), true, id);
  for (const id of ["TRIP-26-01541", "TRIP-26-09999", "TRIP-26-00000", "TRIP-25-01000", "TRIP-27-00001", ""]) assert.equal(inFirstGroup(id), false, id);
  assert.deepEqual([1, 2, 3, 4, 5].map(seatFromFirstGroup), [true, true, true, false, false]);
  assert.equal(seatFromFirstGroup(0), false);
  assert.equal(seatFromFirstGroup(null), false);
});

test("the seat a press fills: from the first, in order, then a new round", () => {
  assert.deepEqual(seatOfNextDraw([], NOW), { round: 1, seat: 1 });
  assert.deepEqual(seatOfNextDraw([draw(1), draw(2)], NOW), { round: 1, seat: 3 });
  assert.deepEqual(seatOfNextDraw([draw(1), draw(2), draw(3), draw(4)], NOW), { round: 1, seat: 5 });
  assert.deepEqual(seatOfNextDraw([1, 2, 3, 4, 5].map((n) => draw(n)), NOW), { round: 2, seat: 1 });
  assert.deepEqual(seatOfNextDraw([1, 2, 3, 4, 5, 6, 7, 8].map((n) => draw(n)), NOW), { round: 2, seat: 4 });
});

test("a released seat is filled first: one of seats 1 to 3 released is drawn again from the group", () => {
  // Seat 2 released after the round filled: the next press fills seat 2 of round 1, a first-group seat.
  const draws = [draw(1), draw(2, 60), draw(3), draw(4), draw(5)];
  const next = seatOfNextDraw(draws, NOW);
  assert.deepEqual(next, { round: 1, seat: 2 });
  assert.equal(seatFromFirstGroup(next.seat), true);
  // Seat 4 released: drawn again from everyone.
  assert.deepEqual(seatOfNextDraw([draw(1), draw(2), draw(3), draw(4, 60), draw(5)], NOW).seat, 4);
});

test("a winner marked spam or deleted lets go only after every draw, so a press now never takes that seat", () => {
  // Round 1 full, seat 3's application deleted: the board shows seat 3 open, but a draw now goes to round 2 seat 1,
  // which is exactly where the board puts it once made (and so the group is round 2 seat 1's).
  const draws = [draw(1), draw(2), draw(3, null, true), draw(4), draw(5)];
  assert.deepEqual(seatOfNextDraw(draws, NOW), { round: 2, seat: 1 });
  const after = seatDraws([...draws, { id: "new", number: 6, drawnAt: NOW, releasedAt: null }]);
  assert.equal(after.roundOf.new, 2);
  assert.equal(after.seatOf.new, 1);
});

test("over 2,000 random histories, the seat worked out is the seat the board then shows", () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let h = 0; h < 2000; h++) {
    const n = 1 + Math.floor(rand() * 14);
    const draws = [];
    for (let k = 1; k <= n; k++) {
      const r = rand();
      draws.push(draw(k, r < 0.15 ? k * 10 + 1 + Math.floor(rand() * 200) : null, r >= 0.15 && r < 0.22));
    }
    const nextAt = at(n * 10 + 400);
    const expected = seatOfNextDraw(draws, nextAt);
    const after = seatDraws([...draws, { id: "made", number: n + 1, drawnAt: nextAt, releasedAt: null }]);
    assert.deepEqual({ round: after.roundOf.made, seat: after.seatOf.made }, expected, `history ${h}: ${JSON.stringify(draws)}`);
  }
});
