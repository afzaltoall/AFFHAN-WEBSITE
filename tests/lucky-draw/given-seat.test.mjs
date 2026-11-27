// The draw's seat given before it (the owner, 2026-11-27: "we already make a lucky draw the person have to come in seat
// 5 he is already selected and a winner too ... just mention in terms only"; Terms clause 3): when the next press fills
// it, and who the wall leaves off until then. The server decides by its own seat (seatOfNextDraw); this is the screen's
// and the console's word, so neither starts the search for that press.
import { test } from "node:test";
import assert from "node:assert/strict";
import { givenNext, seatOfNextDraw } from "@/lib/lucky-draw-shared";
import { wallOf } from "@/components/lucky-draw/wall/drum";

const GIVEN = { seat: 5, tripId: "TRIP-26-05555" };
const board = (seats, round = 1, given = GIVEN) => ({ seats, round, given });
const open = [null, null, null, null, null];

test("the press that fills seat 5 of the draw is the given one; no other press is", () => {
  assert.equal(givenNext(board(open)), false, "seat 1 next");
  assert.equal(givenNext(board(["a", "b", "c", null, null])), false, "seat 4 next");
  assert.equal(givenNext(board(["a", "b", "c", "d", null])), true, "seat 5 next");
  assert.equal(givenNext(board(["a", null, "c", "d", null])), false, "a released seat 2 is filled first");
  assert.equal(givenNext(board(["a", "b", "c", "d", null]), true), false, "not once the screen has started the waiting list");
  assert.equal(givenNext(board(["a", "b", "c", "d", null], 2)), false, "the waiting list's seat 5 is drawn");
  assert.equal(givenNext(board(["a", "b", "c", "d", null], 1, null)), false, "nothing given: seat 5 is drawn");
});

test("the server's own seat for the fifth press of the draw is round 1, seat 5", () => {
  const at = (k) => new Date(Date.UTC(2026, 11, 1, 18, 0, k)).toISOString();
  const draws = [1, 2, 3, 4].map((n) => ({ id: `d${n}`, number: n, drawnAt: at(n), releasedAt: null }));
  assert.deepEqual(seatOfNextDraw(draws, at(9)), { round: 1, seat: 5 });
  // Seat 2 released after the fourth: the next press fills seat 2 (drawn), the one after it seat 5.
  const released = draws.map((d) => (d.id === "d2" ? { ...d, releasedAt: at(5) } : d));
  assert.deepEqual(seatOfNextDraw(released, at(9)), { round: 1, seat: 2 });
});

test("the wall leaves the given person off until their press; once they hold the seat, they are on it in gold", () => {
  const pool = [
    ["TRIP-26-00001", "A", "Chennai", "India"],
    ["TRIP-26-05555", "Given", "Chennai", "India"],
    ["TRIP-26-09000", "C", "Dubai", "United Arab Emirates"],
  ];
  const before = wallOf(pool, [], GIVEN.tripId);
  assert.deepEqual(before.entries.map((e) => e[0]), ["TRIP-26-00001", "TRIP-26-09000"]);
  assert.equal(wallOf(pool, []).entries.length, 3, "nothing given: everyone");
  const seated = [{ id: "x", number: 5, tripId: GIVEN.tripId, name: "Given", city: "Chennai", country: "India", drawnAt: "", poolSize: 0, round: 1, seat: 5, out: false, given: true }];
  const after = wallOf(pool.filter((e) => e[0] !== GIVEN.tripId), seated, null);
  assert.ok(after.entries.some((e) => e[0] === GIVEN.tripId));
  assert.ok(after.gold.has(GIVEN.tripId));
});
