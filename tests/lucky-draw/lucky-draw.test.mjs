// The Free China Trip's lucky draw (2026-11-10): who holds which seat, worked out from the draws alone
// (src/lib/lucky-draw-shared.ts). The owner: "our target is 5 persons, each draw 1 person ... make it infinity"; then
// "once five seats complete, give a next option; click it and draw 2 opens". So each round has five seats of its
// own, filled in order; once all five are taken the next draw takes seat 1 of the next round (the screens offer
// the next round first), the round before kept as it was; someone who can't take part leaves their seat open and the
// next draw fills it first; Restore is as if the release never happened; an application taken out as spam or deleted
// counts as released. Round 1 is the draw, every round after it the waiting list, numbered on (2026-11-25).
//   npm run test:lucky-draw
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DRAW_SEATS,
  inWaitingList,
  isDrawMode,
  nextPlace,
  nextRoundWords,
  personName,
  placeWords,
  roundFull,
  roundName,
  seatDraws,
  seatMark,
  seatName,
  waitingNo,
} from "@/lib/lucky-draw-shared";

const T0 = Date.parse("2026-12-01T10:00:00.000Z");
const at = (s) => new Date(T0 + s * 1000).toISOString();
/** Draws a, b, c … drawn a second apart, in order. */
const drawn = (ids) => ids.map((id, i) => ({ id, number: i + 1, drawnAt: at(i), releasedAt: null }));
/** The board's view of a seating: the current round's seats and its number. */
const board = (s) => ({ seats: s.rounds[s.rounds.length - 1], round: s.rounds.length });

test("five seats, the Terms' five winners", () => {
  assert.equal(DRAW_SEATS, 5);
  assert.ok(isDrawMode("live") && isDrawMode("rehearsal"));
  assert.ok(!isDrawMode("Live") && !isDrawMode("") && !isDrawMode(undefined) && !isDrawMode("test"));
});

test("round 1 fills its seats in order", () => {
  const s = seatDraws(drawn(["a", "b", "c"]));
  assert.deepEqual(s.rounds, [["a", "b", "c", null, null]]);
  assert.deepEqual([s.roundOf.c, s.seatOf.c], [1, 3]);
  assert.deepEqual(nextPlace(board(s)), { n: 4, round: 1 });
  assert.equal(roundFull(board(s)), false);
  const empty = seatDraws([]);
  assert.deepEqual(empty.rounds, [[null, null, null, null, null]]);
  assert.deepEqual(nextPlace(board(empty)), { n: 1, round: 1 });
});

test("once all five are taken, the next draw takes seat 1 of round 2, and round 1 stays as it was", () => {
  const five = seatDraws(drawn([..."abcde"]));
  assert.equal(roundFull(board(five)), true, "the screens offer Start round 2 now");
  assert.deepEqual(nextPlace(board(five)), { n: 1, round: 2 });
  const six = seatDraws(drawn([..."abcdef"]));
  assert.deepEqual(six.rounds, [[..."abcde"], ["f", null, null, null, null]]);
  assert.deepEqual([six.roundOf.f, six.seatOf.f], [2, 1]);
  assert.deepEqual([six.roundOf.a, six.seatOf.a], [1, 1], "round 1's seat 1 keeps its holder");
  assert.deepEqual(nextPlace(board(six)), { n: 2, round: 2 });
  const eleven = seatDraws(drawn([..."abcdefghijk"]));
  assert.deepEqual(eleven.rounds, [[..."abcde"], [..."fghij"], ["k", null, null, null, null]]);
  assert.deepEqual(nextPlace(board(eleven)), { n: 2, round: 3 });
});

test("someone who can't take part leaves their seat open, and the next draw fills it before any other", () => {
  const d = drawn([..."abcde"]);
  d[2].releasedAt = at(60); // c, round 1 seat 3
  const s = seatDraws(d);
  assert.deepEqual(s.rounds, [["a", "b", null, "d", "e"]]);
  assert.deepEqual(s.out, ["c"]);
  assert.equal(s.seatOf.c, null);
  assert.equal(roundFull(board(s)), false, "not full: no new round yet");
  assert.deepEqual(nextPlace(board(s)), { n: 3, round: 1 });
  d.push({ id: "x", number: 6, drawnAt: at(70), releasedAt: null });
  assert.deepEqual(seatDraws(d).rounds, [["a", "b", "x", "d", "e"]]);
  // A release in an earlier round leaves that round's seat open; draws go on in the current round.
  const e = drawn([..."abcdefg"]); // round 2 holds f, g
  e[1].releasedAt = at(60); // b, round 1 seat 2
  e.push({ id: "y", number: 8, drawnAt: at(70), releasedAt: null });
  const r = seatDraws(e);
  assert.deepEqual(r.rounds, [["a", null, "c", "d", "e"], ["f", "g", "y", null, null]]);
});

test("Restore is as if the release never happened, whoever was drawn since", () => {
  const d = drawn([..."abcde"]);
  d[1].releasedAt = at(60); // b released, seat 2 open
  d.push({ id: "x", number: 6, drawnAt: at(70), releasedAt: null }); // x takes seat 2 of round 1
  assert.deepEqual(seatDraws(d).rounds, [["a", "x", "c", "d", "e"]]);
  d[1].releasedAt = null; // b restored: x was the first draw of round 2
  const s = seatDraws(d);
  assert.deepEqual(s.rounds, [[..."abcde"], ["x", null, null, null, null]]);
  assert.deepEqual(s.out, []);
});

test("an application taken out (spam or deleted) counts as released, after everything else", () => {
  const d = drawn([..."abcde"]);
  d[2].removed = true; // c
  const s = seatDraws(d);
  assert.deepEqual(s.rounds, [["a", "b", null, "d", "e"]]);
  assert.deepEqual(s.out, ["c"]);
  d[2].releasedAt = at(60);
  assert.deepEqual(seatDraws(d).out, ["c"], "released and taken out: out once");
});

test("draws keep their own order whatever their clocks say, and a release never comes before its draw", () => {
  const d = [
    { id: "first", number: 1, drawnAt: at(5), releasedAt: null },
    { id: "second", number: 2, drawnAt: at(4), releasedAt: null },
  ];
  assert.deepEqual(seatDraws(d).rounds[0].slice(0, 2), ["first", "second"]);
  assert.deepEqual(seatDraws([...d].reverse()).rounds[0].slice(0, 2), ["first", "second"]);
  const e = [
    { id: "a", number: 1, drawnAt: at(10), releasedAt: null },
    { id: "b", number: 2, drawnAt: at(9), releasedAt: at(9.5) },
  ];
  const s = seatDraws(e);
  assert.deepEqual(s.rounds[0].slice(0, 2), ["a", null]);
  assert.deepEqual(s.out, ["b"]);
});

// The owner, 2026-11-25, over "Round 1 complete" and "Start round 2": "edhula round maari vendam ... first panrom la adhu
// draw va erukatum ... remaining la next set waiting list vachupom". Round 1 is the draw; every round after it the
// waiting list (the Terms' reserve applicants), its places numbered on in the order drawn.
test("round 1 is the draw, every round after it the waiting list, numbered on", () => {
  assert.equal(inWaitingList(1), false);
  assert.ok(inWaitingList(2) && inWaitingList(3) && inWaitingList(9));
  assert.equal(roundName(1), "The draw");
  assert.equal(roundName(2), "Waiting list");
  assert.equal(roundName(5), "Waiting list");
  assert.deepEqual([waitingNo(2, 1), waitingNo(2, 5), waitingNo(3, 1), waitingNo(3, 5), waitingNo(4, 3)], [1, 5, 6, 10, 13]);
  assert.deepEqual(seatMark(1, 4), { word: "Seat", n: 4 });
  assert.deepEqual(seatMark(3, 2), { word: "No.", n: 7 });
  assert.equal(seatName(1, 4), "Seat 4");
  assert.equal(seatName(2, 4), "No. 4");
  assert.equal(seatName(3, 1), "No. 6");
  assert.equal(placeWords({ n: 3, round: 1 }), "Seat 3 of 5");
  assert.equal(placeWords({ n: 1, round: 2 }), "Waiting list · No. 1");
  assert.equal(placeWords({ n: 2, round: 3 }), "Waiting list · No. 7");
  assert.equal(nextRoundWords(1), "Start waiting list", "after the draw's five");
  assert.equal(nextRoundWords(2), "Continue waiting list", "after each five of the waiting list");
  assert.equal(nextRoundWords(3), "Continue waiting list");
  // The rounds fill as they always have: the waiting list is only their name.
  const s = seatDraws(drawn([..."abcdefghijkl"]));
  const no = (id) => waitingNo(s.roundOf[id], s.seatOf[id]);
  assert.deepEqual([s.roundOf.e, s.seatOf.e], [1, 5], "e: the draw's seat 5");
  assert.deepEqual([no("f"), no("j"), no("k"), no("l")], [1, 5, 6, 7], "f to l: waiting list No. 1 to 7, in the order drawn");
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
