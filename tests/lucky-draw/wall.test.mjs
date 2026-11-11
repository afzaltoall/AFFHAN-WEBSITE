// The TV screen's wall (src/components/lucky-draw/wall/grid.ts and drum.ts): who is on it and in what order; the
// press (every ticket face down before any name changes, face up only after the answer, then the roll, smooth, at
// rest on a whole column); and that the light searches over the rolling tickets, every jump a snap to a ticket beside
// the last that the room can see, its last onto the person drawn.
//   npm run test:lucky-draw
import { test } from "node:test";
import assert from "node:assert/strict";
import { placeOfTrip, wallOf } from "@/components/lucky-draw/wall/drum";
import {
  ALL_DOWN,
  BACKS_T,
  CRUISE,
  DOWN_AT,
  FLIP_T,
  GRID,
  MOVE_T,
  SEARCH_T,
  STEP_QUICK,
  STEP_SLOW,
  TAIL_T,
  WAVE_T,
  dist,
  drawPlan,
  flatX,
  flipAngle,
  flipDelay,
  mod,
  nextStep,
  openingRows,
  pathAt,
  personAt,
  rollAt,
  stepIndex,
  stepTimes,
  stretchFor,
  walkAhead,
  walkStart,
} from "@/components/lucky-draw/wall/grid";

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const id = (n) => `TRIP-26-${String(n).padStart(5, "0")}`;
const entry = (n) => [id(n), `Person ${n}`, "Chennai", "India"];
const card = (n, over = {}) => ({ id: `d${n}`, number: n, tripId: id(n), name: `Person ${n}`, city: "Chennai", country: "India", drawnAt: "2026-11-25T10:00:00.000Z", poolSize: 100, round: 1, seat: 1, out: false, ...over });

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

test("the press: every ticket face down before any name can change, face up again only after the answer", () => {
  const rows = 6;
  const cols = GRID.cols;
  const delays = [];
  for (let r = 0; r < rows; r++) for (let k = 0; k <= cols + 1; k++) delays.push(flipDelay(r, k, rows, cols));
  assert.ok(Math.min(...delays) === 0 && Math.max(...delays) <= WAVE_T + 1e-9, "the wave crosses the wall in WAVE_T");
  assert.ok(flipDelay(0, 0, rows, cols) < flipDelay(2, 3, rows, cols) && flipDelay(2, 3, rows, cols) < flipDelay(5, 9, rows, cols), "from the top left to the bottom right");
  for (const ta of [0.05, 0.3, 0.9, 1.6, 4]) {
    const { up, roll0, light } = drawPlan(100.4, ta);
    assert.ok(up >= ALL_DOWN + BACKS_T - 1e-9, "the gold backs show a moment once all are down");
    assert.ok(up >= ta + 0.25 - 1e-9, "never up before the answer");
    for (const d of delays) {
      assert.equal(flipAngle(ALL_DOWN, DOWN_AT, up, d), Math.PI, "every ticket face down by ALL_DOWN");
      assert.equal(flipAngle(up, DOWN_AT, up, d), Math.PI, "and still down when the face-up wave starts");
      assert.ok(Math.abs(flipAngle(up + WAVE_T + FLIP_T, DOWN_AT, up, d) - 2 * Math.PI) < 1e-9, "every ticket face up again after it");
    }
    assert.ok(roll0 > up && roll0 < up + WAVE_T + FLIP_T, "the rows set off as the last tickets finish turning");
    assert.equal(light, roll0, "the light comes on as the rows set off");
  }
  for (const d of delays) assert.equal(flipAngle(30, DOWN_AT, Infinity, d), Math.PI, "before the answer, face down however long it takes");
  assert.equal(flipAngle(0, DOWN_AT, Infinity, 0), 0, "face up at the press");
});

test("the roll: from rest, smoothly, never back, never racing, to rest exactly on its column, the landing about thirty seconds after the press", () => {
  const r = rng(11);
  for (let i = 0; i < 400; i++) {
    const p0 = r() * 5000;
    const ta = 0.05 + r() * 1.5;
    const { roll, end, roll0, land } = drawPlan(p0, ta);
    assert.equal(end, Math.round(end));
    assert.ok(end - p0 >= 5 * GRID.cols - 1 && end - p0 < 6 * GRID.cols, `about five screens of names pass (${(end - p0).toFixed(1)} columns)`);
    assert.ok(roll.td >= roll.acc, "it reaches its pace before it slows");
    const stop = roll.td + roll.dec;
    assert.ok(Math.abs(rollAt(roll, stop).p - end) < 1e-9, "it rests exactly on its column");
    assert.ok(Math.abs(land - (roll0 + stop + TAIL_T)) < 1e-9);
    if (ta < 1.5) assert.ok(land >= SEARCH_T - 1e-9 && land < SEARCH_T + 0.5, `about ${SEARCH_T} seconds from the press to the landing (${land.toFixed(2)})`);
    let last = rollAt(roll, 0);
    assert.equal(last.v, 0, "from rest");
    for (let t = 0.005; t < stop + 1; t += 0.005) {
      const now = rollAt(roll, t);
      assert.ok(now.p >= last.p - 1e-12, "never back");
      assert.ok(Math.abs(now.v - last.v) < 0.03, `no jolt in its pace at ${t.toFixed(3)} s`);
      assert.ok(now.p - last.p < CRUISE * 0.005 + 1e-9, "never faster than its steady pace");
      last = now;
    }
    assert.equal(rollAt(roll, stop + 1).v, 0, "and at rest");
  }
});

test("the light's times: quick jumps, then slower and slower, the last the slowest", () => {
  const { light: from, land: end } = drawPlan(10, 0.3);
  const t = stepTimes(from, end);
  assert.equal(t[t.length - 1], end);
  assert.ok(t[0] > from);
  const gaps = t.map((x, i) => x - (i ? t[i - 1] : from));
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] >= gaps[i - 1] - 0.004, `never quicker again (${i})`);
  assert.ok(Math.abs(gaps[0] - STEP_QUICK) < 0.01, "quick at first");
  assert.ok(Math.abs(gaps[gaps.length - 1] - STEP_SLOW) < 1e-9, "the last the slowest");
  assert.ok(t.length >= 30, `${t.length} jumps`);
});

test("the light snaps: on a ticket, then a jump of MOVE_T to the next, never a slow drag", () => {
  const cells = [
    { r: 2, c: 5 },
    { r: 2, c: 6 },
    { r: 3, c: 7 },
    { r: 2, c: 7 },
  ];
  const times = [1, 1.11, 1.22, 2];
  for (let t = 0.9; t < 2.1; t += 0.001) {
    const q = pathAt(cells, times, t);
    const k = times.findIndex((x) => x > t);
    const moving = k > 0 && t > times[k] - MOVE_T;
    if (!moving) {
      const at = cells[k < 0 ? cells.length - 1 : Math.max(0, k - 1)];
      assert.ok(Math.abs(q.r - at.r) < 1e-9 && Math.abs(q.c - at.c) < 1e-9, `on a ticket at ${t.toFixed(3)}`);
    }
  }
  assert.equal(stepIndex(times, 1.0), 0);
  assert.equal(stepIndex(times, 1.11 - MOVE_T + 1e-6), 1, "a jump counts from the moment it begins");
  assert.equal(stepIndex(times, 5), 3);
});

/** One draw, as the stage plays it, frame by frame at 60 a second: the light from the moment the rows set off. */
function playChase(seed, rows) {
  let x = seed >>> 0;
  const rnd = () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
  const p0 = rnd() * 3000;
  const { roll, roll0, end, light, land } = drawPlan(p0, 0.1 + rnd() * 0.8);
  const pAt = (t) => rollAt(roll, t - roll0).p;
  const ok = (c, at, leave) => c.r >= 0 && c.r < rows && c.c >= pAt(leave) + 0.75 && c.c <= pAt(at) + GRID.cols + 0.25;
  const target = { r: Math.floor(rnd() * rows), c: end + 1 + Math.floor(rnd() * GRID.cols) };
  const start = { r: Math.floor((rows - 1) / 2), c: Math.floor(p0) + Math.ceil(GRID.cols / 2) };
  const w = walkStart(start, Math.floor(rnd() * 8), light, target, land);
  for (let t = light; t <= land + 0.1; t += 1 / 60) walkAhead(w, t, ok, rnd);
  return { w, ok: (c, k) => ok(c, w.times[k], w.times[k + 1] ?? w.times[k]), target, land, pAt };
}

test("every draw: the light jumps a ticket at a time all over the wall as it rolls, and its last jump, only that, lands on the person drawn", () => {
  const dirs = new Set();
  let steps = 0;
  let upDown = 0;
  let cover = 0;
  const N = 2000;
  for (let seed = 1; seed <= N; seed++) {
    const rows = [6, 6, 6, 5, 4, 3, 2][seed % 7];
    const { w, ok, target, land, pAt } = playChase(seed, rows);
    const { cells, times } = w;
    for (let k = 1; k < cells.length; k++) {
      assert.equal(dist(cells[k - 1], cells[k]), 1, `seed ${seed}: jump ${k} is to a ticket beside the last`);
      assert.ok(ok(cells[k], k), `seed ${seed}: jump ${k} is to a ticket on the screen while the light is on it`);
      if (k < cells.length - 1) assert.ok(cells[k].r !== target.r || cells[k].c !== target.c, `seed ${seed}: not on them before the last jump`);
      dirs.add(`${cells[k].r - cells[k - 1].r},${cells[k].c - cells[k - 1].c}`);
      steps++;
      if (cells[k].r !== cells[k - 1].r) upDown++;
    }
    assert.deepEqual(cells[cells.length - 1], target, `seed ${seed}: the last jump is onto the person drawn`);
    assert.equal(times[times.length - 1], land);
    // How much of the screen it searched: the places on the screen it was on.
    cover += new Set(cells.map((c, k) => `${c.r}:${Math.round(c.c - pAt(times[k]))}`)).size / (rows * GRID.cols);
  }
  assert.equal(dirs.size, 8, `all eight ways (${[...dirs].join(" ")})`);
  assert.ok(upDown / steps > 0.35, `up and down as well as across (${((100 * upDown) / steps).toFixed(0)}% of jumps change row)`);
  assert.ok(cover / N > 0.45, `it searches much of the wall: ${((100 * cover) / N).toFixed(0)}% of its tickets on average`);
});

test("the light keeps its way and turns now and then; with nowhere to go it stays", () => {
  const always = () => true;
  let kept = 0;
  let s = 5;
  const r = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
  for (let i = 0; i < 2000; i++) if (nextStep({ r: 5, c: 5 }, 1, null, 99, always, r).dir === 1) kept++;
  assert.ok(kept > 1300 && kept < 1600, `kept its way ${kept} times in 2,000`);
  const cur = { r: 0, c: 5 };
  assert.deepEqual(nextStep(cur, 0, null, 9, () => false, Math.random).cell, cur);
  // At the screen's edge it bounces off: going up-right on the top row, it goes down-right.
  const top = (c) => c.r >= 0 && c.r < 6;
  assert.deepEqual(nextStep({ r: 0, c: 5 }, 7, null, 99, top, () => 0.1).cell, { r: 1, c: 6 });
});
