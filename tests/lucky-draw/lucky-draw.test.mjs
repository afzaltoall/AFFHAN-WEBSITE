// The Free China Trip's lucky draw (2026-11-10): who holds which seat, worked out from the draws alone
// (src/lib/lucky-draw-shared.ts). The owner: "our target is 5 persons, each draw 1 person ... make it infinity"; then
// "after completing 5 seats, again draw has to place in 1st ... replacing 1st one ... in order" (a fresh round from
// seat 1). So: round 1 fills seats 1 to 5; the next draw starts round 2 and takes seat 1, the next seat 2, in order;
// someone who can't take part leaves their seat open and the next draw fills it first; Restore is as if the release
// never happened; an application taken out as spam or deleted counts as released.
//   npm run test:lucky-draw
import { test } from "node:test";
import assert from "node:assert/strict";
import { DRAW_SEATS, isDrawMode, nextPlace, personName, placeOf, seatDraws, seatWords } from "@/lib/lucky-draw-shared";

const T0 = Date.parse("2026-12-01T10:00:00.000Z");
const at = (s) => new Date(T0 + s * 1000).toISOString();
/** Draws a, b, c … drawn a second apart, in order. */
const drawn = (ids) => ids.map((id, i) => ({ id, number: i + 1, drawnAt: at(i), releasedAt: null }));
const board = (s) => ({ seats: s.seats, seatRounds: s.seatRounds, round: s.round });

test("five seats, the Terms' five winners", () => {
  assert.equal(DRAW_SEATS, 5);
  assert.ok(isDrawMode("live") && isDrawMode("rehearsal"));
  assert.ok(!isDrawMode("Live") && !isDrawMode("") && !isDrawMode(undefined) && !isDrawMode("test"));
});

test("round 1 fills the seats in order", () => {
  const s = seatDraws(drawn(["a", "b", "c"]));
  assert.deepEqual(s.seats, ["a", "b", "c", null, null]);
  assert.deepEqual(s.seatRounds, [1, 1, 1, null, null]);
  assert.equal(s.round, 1);
  assert.deepEqual(nextPlace(board(s)), { n: 4, round: 1 });
  const empty = seatDraws([]);
  assert.deepEqual(empty.seats, [null, null, null, null, null]);
  assert.equal(empty.round, 1);
  assert.deepEqual(nextPlace(board(empty)), { n: 1, round: 1 });
});

test("after seat 5, the next draw starts round 2 in seat 1, replacing its holder, and the rest follow in order", () => {
  const five = seatDraws(drawn([..."abcde"]));
  assert.deepEqual(nextPlace(board(five)), { n: 1, round: 2 }, "the press after seat 5 goes to seat 1 of round 2");
  const six = seatDraws(drawn([..."abcdef"]));
  assert.deepEqual(six.seats, ["f", "b", "c", "d", "e"]);
  assert.deepEqual(six.seatRounds, [2, 1, 1, 1, 1]);
  assert.equal(six.round, 2);
  assert.deepEqual(six.replacedBy, { a: "f" });
  assert.deepEqual(nextPlace(board(six)), { n: 2, round: 2 });
  const ten = seatDraws(drawn([..."abcdefghij"]));
  assert.deepEqual(ten.seats, [..."fghij"]);
  assert.deepEqual(ten.seatRounds, [2, 2, 2, 2, 2]);
  assert.deepEqual(nextPlace(board(ten)), { n: 1, round: 3 });
  const twelve = seatDraws(drawn([..."abcdefghijkl"]));
  assert.deepEqual(twelve.seats, ["k", "l", "h", "i", "j"]);
  assert.deepEqual(twelve.seatRounds, [3, 3, 2, 2, 2]);
  assert.equal(twelve.roundOf.a, 1);
  assert.equal(twelve.roundOf.f, 2);
  assert.equal(twelve.roundOf.k, 3);
  assert.equal(twelve.replacedBy.f, "k");
});

test("someone who can't take part leaves their seat open, and the next draw fills it before any other", () => {
  const d = drawn([..."abcde"]);
  d[2].releasedAt = at(60); // c, seat 3
  const s = seatDraws(d);
  assert.deepEqual(s.seats, ["a", "b", null, "d", "e"]);
  assert.deepEqual(s.out, ["c"]);
  assert.deepEqual(nextPlace(board(s)), { n: 3, round: 1 }, "the open seat, still round 1");
  d.push({ id: "x", number: 6, drawnAt: at(70), releasedAt: null });
  const filled = seatDraws(d);
  assert.deepEqual(filled.seats, ["a", "b", "x", "d", "e"]);
  assert.deepEqual(filled.seatRounds, [1, 1, 1, 1, 1]);
  // And in round 2: a released round-1 holder's seat is filled in round 2, before the next seat in order.
  const e = drawn([..."abcdef"]); // f took seat 1 in round 2
  e[3].releasedAt = at(60); // d, seat 4 (round 1)
  e.push({ id: "y", number: 7, drawnAt: at(70), releasedAt: null });
  const r2 = seatDraws(e);
  assert.deepEqual(r2.seats, ["f", "b", "c", "y", "e"]);
  assert.deepEqual(r2.seatRounds, [2, 1, 1, 2, 1]);
  assert.deepEqual(nextPlace(board(r2)), { n: 2, round: 2 }, "then on in order from seat 2");
});

test("Restore is as if the release never happened, whoever was drawn since", () => {
  const d = drawn([..."abcde"]);
  d[1].releasedAt = at(60); // b released, seat 2 open
  d.push({ id: "x", number: 6, drawnAt: at(70), releasedAt: null }); // x takes seat 2, round 1
  assert.deepEqual(seatDraws(d).seats, ["a", "x", "c", "d", "e"]);
  d[1].releasedAt = null; // b restored: x was the first draw of round 2, in seat 1
  const s = seatDraws(d);
  assert.deepEqual(s.seats, ["x", "b", "c", "d", "e"]);
  assert.deepEqual(s.seatRounds, [2, 1, 1, 1, 1]);
  assert.deepEqual(s.out, []);
});

test("an application taken out (spam or deleted) counts as released, after everything else", () => {
  const d = drawn([..."abcde"]);
  d[2].removed = true; // c
  const s = seatDraws(d);
  assert.deepEqual(s.seats, ["a", "b", null, "d", "e"]);
  assert.deepEqual(s.out, ["c"]);
  d[2].releasedAt = at(60);
  assert.deepEqual(seatDraws(d).out, ["c"], "released and taken out: out once");
});

test("draws keep their own order whatever their clocks say, and a release never comes before its draw", () => {
  const d = [
    { id: "first", number: 1, drawnAt: at(5), releasedAt: null },
    { id: "second", number: 2, drawnAt: at(4), releasedAt: null },
  ];
  assert.deepEqual(seatDraws(d).seats.slice(0, 2), ["first", "second"]);
  assert.deepEqual(seatDraws([...d].reverse()).seats.slice(0, 2), ["first", "second"]);
  const e = [
    { id: "a", number: 1, drawnAt: at(10), releasedAt: null },
    { id: "b", number: 2, drawnAt: at(9), releasedAt: at(9.5) },
  ];
  const s = seatDraws(e);
  assert.deepEqual(s.seats.slice(0, 2), ["a", null]);
  assert.deepEqual(s.out, ["b"]);
});

test("placeOf and the words for a seat", () => {
  const s = seatDraws(drawn([..."abcdefg"]));
  assert.deepEqual(placeOf(board(s), "c"), { n: 3, round: 1 });
  assert.deepEqual(placeOf(board(s), "g"), { n: 2, round: 2 });
  assert.equal(placeOf(board(s), "a"), null, "replaced: no seat");
  assert.equal(seatWords({ n: 3, round: 1 }), "Seat 3 of 5");
  assert.equal(seatWords({ n: 1, round: 2 }), "Seat 1 of 5 · Round 2");
});

test("names and cities are set for a screen, word by word", () => {
  assert.equal(personName("mohamed ismail"), "Mohamed Ismail");
  assert.equal(personName("MOHAMED ISMAIL"), "Mohamed Ismail");
  assert.equal(personName("  priya    dharshini "), "Priya Dharshini");
  assert.equal(personName("abdul-rahman"), "Abdul-Rahman");
  assert.equal(personName("o'brien"), "O'Brien");
  assert.equal(personName("s.k. rahman"), "S.K. Rahman");
  assert.equal(personName("Mohamed Shairaz fathima Rukaiya"), "Mohamed Shairaz Fathima Rukaiya", "a word left small gets its capital");
  assert.equal(personName("Rayyan Ahamed AK"), "Rayyan Ahamed AK", "initials stay");
  assert.equal(personName("MOHAMED Ismail"), "Mohamed Ismail");
  assert.equal(personName("McDonald"), "McDonald", "a word's own capitals kept");
  assert.equal(personName("Kumar R"), "Kumar R");
  assert.equal(personName("S. Venkatesh"), "S. Venkatesh");
  assert.equal(personName("MOHAMED BIN RASHID"), "Mohamed bin Rashid");
  assert.equal(personName("Mohamed bin Rashid"), "Mohamed bin Rashid");
  assert.equal(personName("chennai sevenwells"), "Chennai Sevenwells");
  assert.equal(personName("CHENNAI"), "Chennai");
  assert.equal(personName(""), "");
  assert.equal(personName("   "), "");
  assert.equal(personName("அருண் குமார்"), "அருண் குமார்", "a script without capitals is left as it is");
});
