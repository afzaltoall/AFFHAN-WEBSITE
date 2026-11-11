// The TV screen's wall (src/components/lucky-draw/wall/grid.ts and drum.ts): who is on it and in what order, how the
// rows roll, and that the box of light's every step is to a box beside the last that the room can see, its last step
// onto the person the server drew, never a jump.
//   npm run test:lucky-draw
import { test } from "node:test";
import assert from "node:assert/strict";
import { placeOfTrip, wallOf } from "@/components/lucky-draw/wall/drum";
import { GRID, ROLL_T, STEP_QUICK, STEP_SLOW, TAIL_T, flatX, mod, nextCell, openingRows, personAt, rollAt, rollPlan, stepTimes, stretchFor } from "@/components/lucky-draw/wall/grid";

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

const dist = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
/** The screen's edge, either side of the middle (the camera is set back so the columns fill the width). */
const EDGE = (GRID.cols / 2) * GRID.pitchX;
const seen = (c, p) => flatX(GRID, c, p) + GRID.tileW / 2 > -EDGE && flatX(GRID, c, p) - GRID.tileW / 2 < EDGE;

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

test("at rest the screen shows exactly its columns, whole, and nothing of the next ones", () => {
  for (const p of [0, 17, 4321]) {
    const shown = [];
    for (let c = p - 3; c <= p + GRID.cols + 3; c++) if (seen(c, p)) shown.push(c);
    assert.deepEqual(shown, Array.from({ length: GRID.cols }, (_, i) => p + 1 + i));
  }
});

test("the opening: the top row starts with TRIP-26-00001 on the screen's first column, and the rows run through everyone in order", () => {
  for (const [n, count, p] of [
    [6084, 4, 0],
    [5713, 5, 12.4],
    [7, 4, 3],
    [1, 3, 0],
  ]) {
    const rows = openingRows(count, n, p);
    assert.equal(rows.length, count);
    const first = Math.floor(p) + 1;
    assert.equal(personAt(rows[0], first, n), 0, "person 0 first");
    for (const segs of rows) for (let c = first; c < first + 20; c++) assert.equal(personAt(segs, c + 1, n), mod(personAt(segs, c, n) + 1, n), "in Trip ID order along a row");
    // Each row's share, laid end to end, is everyone.
    const share = Math.ceil(n / count);
    const met = new Set();
    for (const segs of rows) for (let k = 0; k < share; k++) met.add(personAt(segs, first + k, n));
    assert.equal(met.size, n, `everyone is in a row (n=${n})`);
  }
});

test("a row's stretches: each takes over from its own column on, the earlier one before it", () => {
  const n = 100;
  const segs = [{ from: 10, start: 40 }];
  assert.equal(personAt(segs, 10, n), 40);
  assert.equal(personAt(segs, 4, n), 34, "before the first stretch, it runs on backwards");
  segs.push({ from: 25, start: 90 });
  assert.equal(personAt(segs, 24, n), 54);
  assert.equal(personAt(segs, 25, n), 90);
  assert.equal(personAt(segs, 35, n), 0, "wrapping round the end");
  // The drawn person's stretch puts them at the column chosen, in their place.
  for (const [i, cut, c] of [
    [0, 30, 33],
    [99, 30, 37],
    [57, 31, 31],
  ]) {
    const s = [{ from: 0, start: 5 }, stretchFor(i, n, cut, c)];
    assert.equal(personAt(s, c, n), i);
    assert.equal(personAt(s, c + 1, n), mod(i + 1, n));
    // Their neighbours on the row are their neighbours by Trip ID (on the new stretch: at the stop, the column before
    // it is off the screen).
    if (c > cut) assert.equal(personAt(s, c - 1, n), mod(i - 1, n));
  }
});

test("a draw's roll: new names come in only from off the screen, and the rows stop on a whole column showing only them", () => {
  const r = rng(11);
  for (let i = 0; i < 500; i++) {
    const p = r() * 5000;
    const extra = i % 3;
    const { cut, end } = rollPlan(GRID, p, extra);
    for (let c = cut; c < cut + 5; c++) assert.ok(!seen(c, p), `column ${c} is off the screen at ${p.toFixed(2)}`);
    assert.equal(end, Math.round(end));
    assert.ok(end + 1 >= cut, "at the stop, every column on the screen is new");
    assert.ok(end - p >= GRID.cols + 1 - 1e-9, "it rolls at least a screen");
    assert.ok(end - p <= GRID.cols + 5, "and not much more");
  }
});

test("the roll: smooth from the pace it had to rest exactly on its column, never back, never racing", () => {
  for (const v0 of [0, 0.05, 0.18]) {
    for (const span of [9, 10.5, 13]) {
      const from = 100.3;
      const to = from + span;
      const start = rollAt(from, to, 0, v0);
      assert.ok(Math.abs(start.p - from) < 1e-12 && Math.abs(start.v - v0) < 1e-12, "it carries on the pace the rows had");
      const stop = rollAt(from, to, ROLL_T, v0);
      assert.equal(stop.p, to);
      assert.ok(Math.abs(stop.v) < 1e-12);
      assert.equal(rollAt(from, to, ROLL_T + 5, v0).p, to, "and stays");
      let last = start.p;
      let fastest = 0;
      for (let t = 0.01; t <= ROLL_T; t += 0.01) {
        const now = rollAt(from, to, t, v0);
        assert.ok(now.p >= last - 1e-12, "never back");
        assert.ok(now.v >= -1e-9);
        fastest = Math.max(fastest, now.v);
        last = now.p;
      }
      assert.ok(fastest <= (1.875 * span) / ROLL_T + v0 + 1e-9, `never racing (${fastest.toFixed(2)} columns a second)`);
      // Its pace, found from its places, is the pace it reports (so the light and the gift read it right).
      for (const t of [0.4, 1.8, 3.1]) {
        const d = (rollAt(from, to, t + 1e-5, v0).p - rollAt(from, to, t - 1e-5, v0).p) / 2e-5;
        assert.ok(Math.abs(d - rollAt(from, to, t, v0).v) < 1e-4);
      }
    }
  }
});

test("the light's steps: quick while the rows roll, then slower and slower on the still wall, the last at the end", () => {
  const from = 0.42;
  const end = from + ROLL_T + TAIL_T;
  const t = stepTimes(from, end);
  assert.equal(t[t.length - 1], end);
  assert.ok(t[0] > from);
  const gaps = t.map((x, i) => x - (i ? t[i - 1] : from));
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] >= gaps[i - 1] - 0.004, `never quicker again (${i})`);
  assert.ok(Math.abs(gaps[0] - STEP_QUICK) < 0.004, "13 a second at first");
  assert.ok(Math.abs(gaps[gaps.length - 1] - STEP_SLOW) < 1e-9, "the last half a second");
  const rolling = t.filter((x) => x <= from + ROLL_T);
  for (let i = 1; i < rolling.length; i++) assert.ok(rolling[i] - rolling[i - 1] < 0.09, "quick all the while the rows roll");
  const slowing = t.filter((x) => x > from + ROLL_T - 0.05);
  assert.ok(slowing.length >= 9, `${slowing.length} slowing steps on the still wall, more than the widest wall needs to cross`);
});

/**
 * One draw, as the stage plays it (./stage.ts): the light wanders over the rows (rolling at their drift pace) until the
 * server answers, then the rows roll a screen and the light steps at the planned times, the last onto the target.
 */
function playDraw(seed, rowsShown) {
  const r = rng(seed);
  const p0 = r() * 3000;
  const v0 = r() < 0.4 ? 0 : 0.18 * r();
  const answer = 0.08 + r() * 0.9;
  const pA = p0 + v0 * answer;
  const { end } = rollPlan(GRID, pA, Math.floor(r() * 3));
  const target = { r: Math.floor(r() * rowsShown), c: end + 1 + Math.floor(r() * GRID.cols) };
  const pAt = (t) => (t < answer ? p0 + v0 * t : rollAt(pA, end, t - answer, v0).p);
  const ok = (t) => (c) => {
    if (c.r < 0 || c.r >= rowsShown) return false;
    for (const ahead of [0, 0.25]) {
      const p = pAt(t + ahead);
      if (c.c < p + 0.75 || c.c > p + GRID.cols + 0.25) return false;
    }
    return true;
  };
  let cur = { r: Math.floor((rowsShown - 1) / 2), c: Math.floor(p0) + Math.ceil(GRID.cols / 2) };
  let prev = null;
  const moves = [];
  const step = (next, at) => {
    moves.push({ from: cur, to: next, at });
    prev = cur;
    cur = next;
  };
  for (let t = STEP_QUICK; t < answer; t += STEP_QUICK) step(nextCell(cur, prev, null, 99, ok(t), r), t);
  const times = stepTimes(answer, answer + ROLL_T + TAIL_T);
  times.forEach((at, i) => {
    const left = times.length - 1 - i;
    step(left === 0 ? target : nextCell(cur, prev, target, left, ok(at), r), at);
  });
  return { moves, target, pAt, end };
}

test("every draw: each step to a box beside the last, on the screen; the last onto the person drawn; never a jump", () => {
  const dirs = new Map();
  let steps = 0;
  let upDown = 0;
  for (let seed = 1; seed <= 3000; seed++) {
    const rowsShown = [2, 3, 4, 4, 5, 8][seed % 6];
    const { moves, target, pAt, end } = playDraw(seed, rowsShown);
    for (const m of moves) {
      assert.equal(dist(m.from, m.to), 1, `seed ${seed}: a step of one box (${JSON.stringify(m)})`);
      assert.ok(m.to.r >= 0 && m.to.r < rowsShown, `seed ${seed}: in a row of the view`);
      const p = pAt(m.at);
      assert.ok(m.to.c >= p + 0.75 - 1e-9 && m.to.c <= p + GRID.cols + 0.25 + 1e-9, `seed ${seed}: on the screen when it lands there`);
      dirs.set(`${m.to.r - m.from.r},${m.to.c - m.from.c}`, (dirs.get(`${m.to.r - m.from.r},${m.to.c - m.from.c}`) ?? 0) + 1);
      steps++;
      if (m.to.r !== m.from.r) upDown++;
    }
    const last = moves[moves.length - 1];
    assert.deepEqual(last.to, target, `seed ${seed}: the last step is onto the person drawn`);
    assert.equal(pAt(last.at), end, "and the rows are still by then");
  }
  assert.equal(dirs.size, 8, `all eight directions (${[...dirs.keys()].join(" ")})`);
  assert.ok(upDown / steps > 0.4, `up and down as much as across (${((100 * upDown) / steps).toFixed(0)}% of steps change row)`);
});

test("a light with nowhere to go stays where it is", () => {
  const cur = { r: 0, c: 5 };
  assert.deepEqual(
    nextCell(cur, null, null, 9, () => false, Math.random),
    cur,
  );
});
