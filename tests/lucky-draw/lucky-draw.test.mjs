// The Free China Trip's lucky draw (2026-11-10): who holds which seat, worked out from the draws alone
// (src/lib/lucky-draw-shared.ts). The owner: "our target is 5 persons, each draw 1 person ... make it infinity: even
// after 5, if someone says they can't, we spin again". So: a draw takes the first open seat, or is a reserve once all
// five are taken; a release gives the seat to the first reserve or opens it for the next draw; Restore is as if the
// release never happened; an application taken out as spam or deleted counts as released.
//   npm run test:lucky-draw
import { test } from "node:test";
import assert from "node:assert/strict";
import { DRAW_SEATS, isDrawMode, personName, placeOf, seatDraws, tripIdDigits, tripIdPrefix } from "@/lib/lucky-draw-shared";

const T0 = Date.parse("2026-12-01T10:00:00.000Z");
const at = (s) => new Date(T0 + s * 1000).toISOString();
/** Draws a, b, c … drawn a second apart, in order. */
const drawn = (ids) => ids.map((id, i) => ({ id, number: i + 1, drawnAt: at(i), releasedAt: null }));

test("five seats, the Terms' five winners", () => {
  assert.equal(DRAW_SEATS, 5);
  assert.ok(isDrawMode("live") && isDrawMode("rehearsal"));
  assert.ok(!isDrawMode("Live") && !isDrawMode("") && !isDrawMode(undefined) && !isDrawMode("test"));
});

test("draws fill the seats in order, then become reserves, without end", () => {
  assert.deepEqual(seatDraws(drawn(["a", "b", "c"])), { seats: ["a", "b", "c", null, null], reserves: [], out: [] });
  const twelve = seatDraws(drawn([..."abcdefghijkl"]));
  assert.deepEqual(twelve.seats, ["a", "b", "c", "d", "e"]);
  assert.deepEqual(twelve.reserves, [..."fghijkl"]);
  assert.deepEqual(seatDraws([]), { seats: [null, null, null, null, null], reserves: [], out: [] });
});

test("someone who can't take part gives their seat to the first reserve", () => {
  const d = drawn([..."abcdefg"]);
  d[1].releasedAt = at(60); // b, seat 2
  const s = seatDraws(d);
  assert.deepEqual(s.seats, ["a", "f", "c", "d", "e"]);
  assert.deepEqual(s.reserves, ["g"]);
  assert.deepEqual(s.out, ["b"]);
});

test("with no reserve, the seat opens and the next draw takes it, the others never moving", () => {
  const d = drawn([..."abcde"]);
  d[2].releasedAt = at(60); // c, seat 3
  assert.deepEqual(seatDraws(d).seats, ["a", "b", null, "d", "e"]);
  d.push({ id: "x", number: 6, drawnAt: at(70), releasedAt: null });
  assert.deepEqual(seatDraws(d).seats, ["a", "b", "x", "d", "e"]);
  // The first seat released, then the third: the next two draws fill them lowest first.
  const e = drawn([..."abcde"]);
  e[0].releasedAt = at(60);
  e[2].releasedAt = at(61);
  e.push({ id: "x", number: 6, drawnAt: at(70), releasedAt: null }, { id: "y", number: 7, drawnAt: at(71), releasedAt: null });
  assert.deepEqual(seatDraws(e).seats, ["x", "b", "y", "d", "e"]);
});

test("a reserve who can't take part comes off the list, and the reserves after them move up", () => {
  const d = drawn([..."abcdefgh"]);
  d[6].releasedAt = at(60); // g, reserve 2
  const s = seatDraws(d);
  assert.deepEqual(s.seats, ["a", "b", "c", "d", "e"]);
  assert.deepEqual(s.reserves, ["f", "h"]);
  assert.equal(placeOf(s, "h")?.n, 2);
});

test("Restore is as if the release never happened, whoever was drawn since", () => {
  const d = drawn([..."abcde"]);
  d[1].releasedAt = at(60); // b released, seat 2 open
  d.push({ id: "x", number: 6, drawnAt: at(70), releasedAt: null }); // x takes seat 2
  assert.deepEqual(seatDraws(d).seats, ["a", "x", "c", "d", "e"]);
  d[1].releasedAt = null; // b restored
  const s = seatDraws(d);
  assert.deepEqual(s.seats, ["a", "b", "c", "d", "e"]);
  assert.deepEqual(s.reserves, ["x"]);
  assert.deepEqual(s.out, []);
});

test("an application taken out (spam or deleted) counts as released, after everything else", () => {
  const d = drawn([..."abcdef"]);
  d[2].removed = true; // c
  const s = seatDraws(d);
  assert.deepEqual(s.seats, ["a", "b", "f", "d", "e"]);
  assert.deepEqual(s.reserves, []);
  assert.deepEqual(s.out, ["c"]);
  // Released and taken out: out once.
  d[2].releasedAt = at(60);
  assert.deepEqual(seatDraws(d).out, ["c"]);
});

test("draws keep their own order whatever their clocks say, and a release never comes before its draw", () => {
  // Number 2 stamped a moment before number 1 (two presses at once): number 1 still has seat 1.
  const d = [
    { id: "first", number: 1, drawnAt: at(5), releasedAt: null },
    { id: "second", number: 2, drawnAt: at(4), releasedAt: null },
  ];
  assert.deepEqual(seatDraws(d).seats.slice(0, 2), ["first", "second"]);
  // Given in any order, read by number.
  assert.deepEqual(seatDraws([...d].reverse()).seats.slice(0, 2), ["first", "second"]);
  // A release stamped before its own (adjusted) draw still comes after it.
  const e = [
    { id: "a", number: 1, drawnAt: at(10), releasedAt: null },
    { id: "b", number: 2, drawnAt: at(9), releasedAt: at(9.5) },
  ];
  const s = seatDraws(e);
  assert.deepEqual(s.seats.slice(0, 2), ["a", null]);
  assert.deepEqual(s.out, ["b"]);
});

test("at the same moment, a draw before a release", () => {
  const d = drawn([..."abcde"]);
  d.push({ id: "f", number: 6, drawnAt: at(60), releasedAt: null });
  d[0].releasedAt = at(60);
  const s = seatDraws(d);
  assert.deepEqual(s.seats, ["f", "b", "c", "d", "e"], "f was a reserve for an instant, then took seat 1");
  assert.deepEqual(s.reserves, []);
});

test("placeOf names a seat, a reserve, or nothing", () => {
  const s = seatDraws(drawn([..."abcdefg"]));
  assert.deepEqual(placeOf(s, "c"), { kind: "seat", n: 3 });
  assert.deepEqual(placeOf(s, "g"), { kind: "reserve", n: 2 });
  assert.equal(placeOf(s, "zz"), null);
});

test("names and cities are set for a screen, as typed when typed with care", () => {
  assert.equal(personName("mohamed ismail"), "Mohamed Ismail");
  assert.equal(personName("MOHAMED ISMAIL"), "Mohamed Ismail");
  assert.equal(personName("  priya    dharshini "), "Priya Dharshini");
  assert.equal(personName("abdul-rahman"), "Abdul-Rahman");
  assert.equal(personName("o'brien"), "O'Brien");
  assert.equal(personName("s.k. rahman"), "S.K. Rahman");
  assert.equal(personName("McDonald"), "McDonald", "a mix of capitals is the person's own");
  assert.equal(personName("Kumar R"), "Kumar R");
  assert.equal(personName("CHENNAI"), "Chennai");
  assert.equal(personName(""), "");
  assert.equal(personName("   "), "");
  assert.equal(personName("அருண் குமார்"), "அருண் குமார்", "a script without capitals is left as it is");
});

test("a Trip ID's five turning digits, and the part that stays still", () => {
  assert.equal(tripIdDigits("TRIP-26-04217"), "04217");
  assert.equal(tripIdPrefix("TRIP-26-04217"), "TRIP-26-");
  assert.equal(tripIdDigits("TRIP-26-00001"), "00001");
  assert.equal(tripIdDigits("TRIP-26-104217"), "04217");
  assert.equal(tripIdPrefix("TRIP-26-104217"), "TRIP-26-1");
  assert.equal(tripIdDigits("odd"), "00000");
});
