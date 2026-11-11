// The TV screen's wall (src/components/lucky-draw/wall/grid.ts and drum.ts): who is on it and in what order, how the
// rows roll and come to rest, and that the box of light searches the whole wall, every step to a box beside the last
// that the room can see, gliding without a jump, its last step onto the person the server drew.
//   npm run test:lucky-draw
import { test } from "node:test";
import assert from "node:assert/strict";
import { placeOfTrip, wallOf } from "@/components/lucky-draw/wall/drum";
import {
  CRUISE,
  GRID,
  STEP_QUICK,
  STEP_SLOW,
  STOP_AT,
  TAIL_T,
  dist,
  flatX,
  mod,
  nextStep,
  openingRows,
  pathAt,
  personAt,
  planStop,
  rollAt,
  startRoll,
  stepTimes,
  stretchFor,
  walkAhead,
  walkLand,
  walkStart,
} from "@/components/lucky-draw/wall/grid";

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

test("the roll: from the drift to a steady pace and to rest, every change smooth, never back, never racing", () => {
  for (const v0 of [0, 0.05, 0.18]) {
    const R = startRoll(100.3, v0);
    R.td = 5.6;
    let last = rollAt(R, 0);
    assert.equal(last.v, v0, "it sets off at the pace the rows had");
    let fastest = 0;
    for (let t = 0.005; t < R.td + R.dec + 2; t += 0.005) {
      const now = rollAt(R, t);
      assert.ok(now.p >= last.p - 1e-12, "never back");
      assert.ok(Math.abs(now.v - last.v) < 0.02, `no jolt in its pace at ${t.toFixed(3)} s`);
      assert.ok(now.p - last.p < CRUISE * 0.005 + 1e-9, "never faster than its steady pace");
      fastest = Math.max(fastest, now.v);
      last = now;
    }
    assert.ok(Math.abs(fastest - CRUISE) < 1e-9);
    assert.equal(rollAt(R, R.td + R.dec + 3).v, 0, "and at rest");
    // Its pace, found from its places, is the pace it reports.
    for (const t of [0.7, 3, R.td + 1.3]) {
      const d = (rollAt(R, t + 1e-5).p - rollAt(R, t - 1e-5).p) / 2e-5;
      assert.ok(Math.abs(d - rollAt(R, t).v) < 1e-4);
    }
  }
});

test("the stop: on a whole column, about STOP_AT after the press, the screen then showing only new names", () => {
  const r = rng(11);
  for (let i = 0; i < 600; i++) {
    const R = startRoll(r() * 5000, r() < 0.4 ? 0 : 0.18 * r());
    const ta = i % 10 === 0 ? 2 + r() * 8 : 0.05 + r() * 1.5;
    const { td, end, cut } = planStop(GRID, R, ta);
    R.td = td;
    const pa = rollAt(R, ta).p;
    for (let c = cut; c < cut + 5; c++) assert.ok(!seen(c, pa), `column ${c} is off the screen when the server answers`);
    assert.equal(end, Math.round(end));
    assert.ok(end + 1 >= cut, "at the stop, every column on the screen is new");
    assert.ok(td >= ta + 0.5 - 1e-9 && td >= R.acc, "it begins to slow only after the answer");
    assert.ok(Math.abs(rollAt(R, td + R.dec).p - end) < 1e-9, `it rests exactly on its column (${rollAt(R, td + R.dec).p} vs ${end})`);
    if (ta < 3) assert.ok(Math.abs(td + R.dec - STOP_AT) <= 1 / CRUISE + 1e-9, `at rest about ${STOP_AT} s after the press (${(td + R.dec).toFixed(2)})`);
  }
});

test("the light's times: its searching pace, then slower and slower, the last half a second and more", () => {
  const from = 0.9;
  const end = 12.2;
  const t = stepTimes(from, end);
  assert.equal(t[t.length - 1], end);
  assert.ok(t[0] > from);
  const gaps = t.map((x, i) => x - (i ? t[i - 1] : from));
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] >= gaps[i - 1] - 0.004, `never quicker again (${i})`);
  assert.ok(Math.abs(gaps[0] - STEP_QUICK) < 0.01, "its searching pace at first");
  assert.ok(Math.abs(gaps[gaps.length - 1] - STEP_SLOW) < 1e-9, "the last step the slowest");
  const still = t.filter((x) => x > end - TAIL_T);
  assert.ok(still.length >= 7, `${still.length} slowing steps on the still wall, enough to cross it`);
});

/**
 * One draw, as the stage plays it (./stage.ts), frame by frame at 60 a second: the rows gather pace from their drift
 * and the light sets off searching; the server answers; the rows come to rest and the light lands.
 */
function playDraw(seed, rowsShown) {
  const rnd = rng(seed);
  const R = startRoll(rnd() * 3000, rnd() < 0.4 ? 0 : 0.18 * rnd());
  const ta = seed % 17 === 0 ? 2 + rnd() * 4 : 0.08 + rnd() * 1.2;
  const ok = (c, at, leave) => c.r >= 0 && c.r < rowsShown && c.c >= rollAt(R, leave).p + 0.75 && c.c <= rollAt(R, at).p + GRID.cols + 0.25;
  const w = walkStart({ r: Math.floor((rowsShown - 1) / 2), c: Math.floor(R.from) + Math.ceil(GRID.cols / 2) }, Math.floor(rnd() * 8));
  let t = 0;
  for (; t < ta; t += 1 / 60) walkAhead(w, t, ok, rnd);
  const { td, end } = planStop(GRID, R, ta);
  R.td = td;
  const landAt = td + R.dec + TAIL_T;
  const target = { r: Math.floor(rnd() * rowsShown), c: end + 1 + Math.floor(rnd() * GRID.cols) };
  walkLand(w, target, landAt);
  const frames = [];
  for (t = 0; t <= landAt + 0.2; t += 1 / 60) {
    walkAhead(w, t, ok, rnd);
    frames.push({ t, ...pathAt(w.cells, w.times, t) });
  }
  return { w, R, end, target, landAt, ok, frames };
}

test("every draw: the light searches the whole wall, a box at a time, never jumping, and lands on the person drawn", () => {
  const dirs = new Set();
  let steps = 0;
  let upDown = 0;
  let cover = 0;
  const N = 1500;
  for (let seed = 1; seed <= N; seed++) {
    const rowsShown = [2, 3, 4, 4, 4, 5, 8][seed % 7];
    const { w, R, end, target, landAt, ok, frames } = playDraw(seed, rowsShown);
    const { cells, times } = w;
    for (let k = 1; k < cells.length; k++) {
      assert.equal(dist(cells[k - 1], cells[k]), 1, `seed ${seed}: step ${k} is to a box beside the last`);
      assert.ok(ok(cells[k], times[k], times[k + 1] ?? times[k]), `seed ${seed}: step ${k} is to a box on the screen while the light is there`);
      dirs.add(`${cells[k].r - cells[k - 1].r},${cells[k].c - cells[k - 1].c}`);
      steps++;
      if (cells[k].r !== cells[k - 1].r) upDown++;
    }
    assert.deepEqual(cells[cells.length - 1], target, `seed ${seed}: the last step is onto the person drawn`);
    assert.equal(times[times.length - 1], landAt);
    for (let k = 0; k < cells.length - 1; k++) assert.ok(cells[k].r !== target.r || cells[k].c !== target.c || times[k] < landAt - 4, `seed ${seed}: not on them before the end`);
    assert.ok(Math.abs(rollAt(R, landAt).p - end) < 1e-9, "the rows are still when it lands");
    assert.ok(landAt > 11 && landAt < (seed % 17 === 0 ? 17 : 13.4), `seed ${seed}: a search of ${landAt.toFixed(1)} s`);
    // The glide: never a jump from one frame to the next, and at rest on them at the end.
    for (let k = 1; k < frames.length; k++) {
      const d = Math.max(Math.abs(frames[k].r - frames[k - 1].r), Math.abs(frames[k].c - frames[k - 1].c));
      assert.ok(d < 0.25, `seed ${seed}: the light glides (${d.toFixed(3)} boxes in a frame at ${frames[k].t.toFixed(2)} s)`);
    }
    const lastF = frames[frames.length - 1];
    assert.ok(Math.abs(lastF.r - target.r) < 1e-9 && Math.abs(lastF.c - target.c) < 1e-9);
    // How much of the screen it searched: the places on the screen it passed over.
    const places = new Set(cells.map((c, k) => `${c.r}:${Math.round(c.c - rollAt(R, times[k]).p)}`));
    cover += places.size / (rowsShown * GRID.cols);
  }
  assert.equal(dirs.size, 8, `all eight directions (${[...dirs].join(" ")})`);
  assert.ok(upDown / steps > 0.35, `up and down as well as across (${((100 * upDown) / steps).toFixed(0)}% of steps change row)`);
  assert.ok(cover / N > 0.6, `it searches most of the screen: ${((100 * cover) / N).toFixed(0)}% of its places on average`);
});

test("the light keeps its way and turns now and then; with nowhere to go it stays", () => {
  const always = () => true;
  let kept = 0;
  const r = rng(5);
  for (let i = 0; i < 2000; i++) if (nextStep({ r: 5, c: 5 }, 1, null, 99, always, r).dir === 1) kept++;
  assert.ok(kept > 1300 && kept < 1600, `kept its way ${kept} times in 2,000`);
  const cur = { r: 0, c: 5 };
  assert.deepEqual(nextStep(cur, 0, null, 9, () => false, Math.random).cell, cur);
  // At the screen's edge it bounces off: going up-right on the top row, it goes down-right.
  const top = (c) => c.r >= 0 && c.r < 4;
  const b = nextStep({ r: 0, c: 5 }, 7, null, 99, top, () => 0.1);
  assert.deepEqual(b.cell, { r: 1, c: 6 });
});
