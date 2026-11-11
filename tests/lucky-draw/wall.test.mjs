// The TV screen's wall (src/components/lucky-draw/wall/drum.ts): who is on it and in what order, where each tile is on
// the turning drum, and where the frame rests between draws. The motion itself is the list's (reel.test.mjs), so a run
// stops exactly on the person the server drew; these check that the wall puts that person there.
//   npm run test:lucky-draw
import { test } from "node:test";
import assert from "node:assert/strict";
import { DRUM, blur, nextFree, placeOf, placeOfTrip, rowOf, shows, wallOf } from "@/components/lucky-draw/wall/drum";
import { endOf, mod, plan, reelAt } from "@/components/lucky-draw/reel";

const id = (n) => `TRIP-26-${String(n).padStart(5, "0")}`;
const entry = (n) => [id(n), `Person ${n}`, "Chennai", "India"];
const card = (n, over = {}) => ({ id: `d${n}`, number: n, tripId: id(n), name: `Person ${n}`, city: "Chennai", country: "India", drawnAt: "2026-11-25T10:00:00.000Z", poolSize: 100, round: 1, seat: 1, out: false, ...over });

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

test("the frame's tile faces the room at the front of the drum", () => {
  const p = placeOf(DRUM, 0);
  assert.equal(p.angle, 0);
  assert.equal(p.facing, 1);
  assert.ok(Math.abs(p.x) < 1e-12 && Math.abs(p.y) < 1e-12 && Math.abs(p.z) < 1e-12);
  // One turn on: the same place round the drum, one row lower.
  const q = placeOf(DRUM, DRUM.perTurn);
  assert.ok(Math.abs(q.x) < 1e-9 && Math.abs(q.z) < 1e-9);
  assert.equal(q.y, -DRUM.pitchY);
});

test("rows stay level: a tile only changes row round the back of the drum, where nobody sees it", () => {
  const K = DRUM.perTurn;
  for (let j = -3 * K; j < 3 * K; j += 0.01) {
    const a = rowOf(DRUM, j);
    const b = rowOf(DRUM, j + 0.01);
    if (a !== b) assert.ok(placeOf(DRUM, j).facing < -0.99, `row changes at j=${j.toFixed(2)}, facing ${placeOf(DRUM, j).facing}`);
    // Within a row, height never changes.
    if (a === b) assert.equal(placeOf(DRUM, j).y, placeOf(DRUM, j + 0.01).y);
  }
});

test("words only near the front, in the frame's row and the rows either side", () => {
  const K = DRUM.perTurn;
  assert.ok(shows(DRUM, 0));
  assert.ok(shows(DRUM, 3) && shows(DRUM, -3));
  assert.ok(shows(DRUM, K) && shows(DRUM, -K), "the rows above and below, at the front");
  assert.ok(!shows(DRUM, 2 * K) && !shows(DRUM, -2 * K), "two rows away: glass");
  assert.ok(!shows(DRUM, K / 2) && !shows(DRUM, -K / 2), "the back of the drum: glass");
  for (let j = -2 * K; j <= 2 * K; j++) if (shows(DRUM, j)) assert.ok(placeOf(DRUM, j).facing > 0.3, `j=${j} shows words but faces away`);
});

test("the wall: everyone who can be drawn, and every winner still holding a seat in gold, in Trip ID order", () => {
  const pool = [entry(5), entry(1), entry(3)];
  const cards = [card(2, { round: 1, seat: 1 }), card(4, { round: 1, seat: null, out: true }), card(6, { round: 2, seat: 3 }), card(3, { seat: 2 })];
  const w = wallOf(pool, cards);
  assert.deepEqual(
    w.entries.map((e) => e[0]),
    [1, 2, 3, 5, 6].map(id),
    "released (4) leaves; winners (2, 6) stay; one in both lists (3) once",
  );
  assert.deepEqual([...w.gold].sort(), [id(2), id(3), id(6)]);
});

test("where a Trip ID is on the wall, or would go", () => {
  const entries = [1, 2, 5, 9].map(entry);
  assert.equal(placeOfTrip(entries, id(1)), 0);
  assert.equal(placeOfTrip(entries, id(5)), 2);
  assert.equal(placeOfTrip(entries, id(3)), 2, "between 2 and 5");
  assert.equal(placeOfTrip(entries, id(10)), 4, "after the last");
});

test("after a winner, the frame rests on the next person who can still be drawn, round the wall", () => {
  const entries = [1, 2, 3, 4, 5].map(entry);
  assert.equal(nextFree(entries, new Set([id(2)]), 1), 2);
  assert.equal(nextFree(entries, new Set([id(2), id(3)]), 1), 3, "winners skipped");
  assert.equal(nextFree(entries, new Set([id(5), id(1)]), 4), 1, "round from the end to the start");
  assert.equal(nextFree(entries, new Set(entries.map((e) => e[0])), 2), 2, "nobody left: stays");
});

test("the words fade as the drum gathers pace and come back as it slows", () => {
  assert.equal(blur(0), 0);
  assert.equal(blur(8), 0);
  assert.equal(blur(30), 1);
  let last = -1;
  for (let v = 0; v <= 30; v += 0.5) {
    const b = blur(v);
    assert.ok(b >= last, "never brighter as it speeds up");
    last = b;
  }
});

test("draw after draw, the drum stops on the person the server drew, never on a winner, the frame moving on after", () => {
  const r = rng(20261111);
  for (const n of [7, 30, 400, 5767]) {
    const pool = Array.from({ length: n }, (_, k) => entry(k + 1));
    let cards = [];
    let at = 0;
    for (let d = 0; d < Math.min(12, n - 1); d++) {
      const wall = wallOf(
        pool.filter((e) => !cards.some((c) => c.tripId === e[0])),
        cards,
      );
      const free = wall.entries.filter((e) => !wall.gold.has(e[0]));
      const winner = free[Math.floor(r() * free.length)];
      const target = placeOfTrip(wall.entries, winner[0]);
      assert.equal(wall.entries[target][0], winner[0]);
      const run = { p0: at, plan: plan(at, r() * 3, target, wall.entries.length), halt: null };
      const end = reelAt(run, endOf(run)).p;
      const framed = wall.entries[mod(Math.round(end), wall.entries.length)][0];
      assert.equal(framed, winner[0], `n=${n} draw ${d}: the frame holds ${framed}, the server drew ${winner[0]}`);
      cards = [...cards, card(Number(winner[0].slice(-5)), { number: d + 1, seat: (d % 5) + 1 })];
      const after = wallOf(
        pool.filter((e) => !cards.some((c) => c.tripId === e[0])),
        cards,
      );
      at = nextFree(after.entries, after.gold, placeOfTrip(after.entries, winner[0]));
      assert.ok(!after.gold.has(after.entries[at][0]) || after.gold.size === after.entries.length, "the frame rests on someone who can be drawn");
    }
  }
});
