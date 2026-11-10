// The TV screen's list in motion (src/components/lucky-draw/reel.ts): every run stops exactly on the person the server
// drew, whatever the list's length, wherever it stood, however long the answer took; it never jumps (every row passes,
// in order, and its pace never leaps); and a draw that fails slows it to a stop on nobody.
//   npm run test:lucky-draw
import { test } from "node:test";
import assert from "node:assert/strict";
import { D3, MIN_RUN, T1, T2, T3, V1, cruise, endOf, halt, mod, plan, reelAt } from "@/components/lucky-draw/reel";

/** A seeded generator, so a failure can be run again exactly. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const runFor = (p0, known, target, n) => ({ p0, plan: plan(p0, known, target, n), halt: null });

test("every run stops exactly on its row, for any list, any start and any answer time", () => {
  const r = rng(20261110);
  for (const n of [2, 3, 7, 30, 160, 161, 999, 5713]) {
    for (let i = 0; i < 400; i++) {
      const p0 = r() * n * 3;
      const known = [0, 0.05, 0.4, T1, 1.3, 4.2, 15][i % 7];
      const target = Math.floor(r() * n);
      const run = runFor(p0, known, target, n);
      const end = endOf(run);
      assert.equal(end, Math.max(T1, known) + T2 + T3);
      const { p, v } = reelAt(run, end);
      assert.ok(Math.abs(mod(p, n) - target) < 1e-6 || Math.abs(mod(p, n) - target) > n - 1e-6, `n ${n}, target ${target}, stopped at ${mod(p, n)}`);
      assert.ok(Math.abs(v) < 1e-9, "at rest");
      assert.ok(run.plan.extra >= MIN_RUN && run.plan.extra < MIN_RUN + n, `the sweep passes ${run.plan.extra} rows`);
    }
  }
});

test("it never jumps: the position only moves forward, and its pace never leaps between the parts", () => {
  const run = runFor(12.4, 0.31, 4021, 5713);
  const end = endOf(run);
  // The steepest the pace ever changes on the curve itself: gathering pace, the sweep's rise, the slowing.
  const peak = V1 + (2 * run.plan.extra) / T2;
  const steepest = Math.max(V1 / T1, ((peak - V1) * Math.PI) / T2, (2 * V1) / T3);
  let last = reelAt(run, 0);
  const step = 1 / 240;
  for (let t = step; t <= end + 1e-9; t += step) {
    const now = reelAt(run, t);
    assert.ok(now.p >= last.p - 1e-9, `forward at ${t.toFixed(3)}s`);
    // No leap: from one frame to the next the pace changes no more than the curve's own steepest slope allows.
    assert.ok(Math.abs(now.v - last.v) <= steepest * step * 1.02 + 1e-6, `pace at ${t.toFixed(3)}s: ${last.v} -> ${now.v}`);
    last = now;
  }
  // Where the parts meet: the same place and the same pace from either side.
  for (const at of [T1, run.plan.t2, run.plan.t2 + T2]) {
    const a = reelAt(run, at - 1e-7);
    const b = reelAt(run, at + 1e-7);
    assert.ok(Math.abs(a.p - b.p) < 1e-4 && Math.abs(a.v - b.v) < 1e-3, `at ${at}s`);
  }
  assert.ok(Math.abs(reelAt(run, run.plan.t2).v - V1) < 1e-9);
  assert.ok(Math.abs(reelAt(run, run.plan.t2 + T2).v - V1) < 1e-6);
});

test("the last stretch is slow enough to read: the last D3 rows take the whole of T3, the final row more than a second", () => {
  const run = runFor(0, 0.2, 100, 5713);
  const end = endOf(run);
  const start = end - T3;
  assert.ok(Math.abs(reelAt(run, end).p - reelAt(run, start).p - D3) < 1e-6);
  // The time the last whole row takes to come under the arrow.
  let t = end;
  while (reelAt(run, end).p - reelAt(run, t).p < 1) t -= 0.001;
  assert.ok(end - t > 1, `the last row takes ${(end - t).toFixed(2)}s`);
});

test("before the answer, it gathers pace and keeps it, for as long as the answer takes", () => {
  assert.deepEqual(cruise(5, 0), { p: 5, v: 0 });
  assert.equal(cruise(5, T1).v, V1);
  assert.equal(cruise(5, 10).v, V1);
  const waiting = { p0: 5, plan: null, halt: null };
  assert.equal(endOf(waiting), Number.POSITIVE_INFINITY);
  assert.deepEqual(reelAt(waiting, 3), cruise(5, 3));
});

test("a draw that fails slows the list to a stop on a whole row, from wherever it was", () => {
  for (const t of [0.1, 0.5, T1, 3]) {
    const run = { p0: 7.3, plan: null, halt: null };
    run.halt = halt(run, t);
    const end = endOf(run);
    assert.ok(run.halt.T >= 0.2 && run.halt.T <= 2);
    const stop = reelAt(run, end);
    assert.equal(stop.p, Math.round(stop.p), "on a whole row");
    assert.ok(stop.p >= reelAt(run, t).p, "never backwards");
    assert.ok(Math.abs(stop.v) < 1e-9);
  }
  const still = { p0: 4, plan: null, halt: null };
  still.halt = halt(still, 0);
  assert.equal(reelAt(still, endOf(still)).p, 4);
});
