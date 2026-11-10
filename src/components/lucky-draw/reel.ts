/**
 * The lucky draw's list in motion on the TV screen (DrawScreen): where it is at every moment of a draw, from the press
 * to the stop on the person drawn. Plain arithmetic, no React and no page, so a test can check that every run stops
 * exactly on its row (tests/lucky-draw).
 *
 * A position is a row of the list, counted round and round it: row i is under the arrow when the position is exactly
 * i (modulo the list's length). One run:
 *   - it gathers pace for T1 seconds, to V1 rows a second (names can still be glimpsed);
 *   - keeps that pace until the draw's answer is in (usually before T1 is over);
 *   - sweeps past the list for T2 seconds, at least MIN_RUN rows and as many more as it takes to arrive where it must,
 *     every row passing in order (it never jumps: the room is watching a real list);
 *   - and slows for T3 seconds over the last D3 rows, easing out, the last names slow enough for the room to read,
 *     coming to rest with the person drawn exactly under the arrow.
 * The pace never jumps either: each part starts at the speed the last one ended with. A draw that fails slows the list
 * to a stop on nobody instead (`halt`).
 */

/** Rows a second while the names can still be glimpsed: the pace before the sweep and as the slowing begins. */
export const V1 = 26;
/** Seconds to reach V1 from a standstill. */
export const T1 = 0.7;
/** Seconds of the sweep past the list. */
export const T2 = 1.6;
/** Seconds of the slowing, to the stop. */
export const T3 = 4.6;
/** Rows passed while slowing: an ease-out (1 - (1 - s)^3) that starts at V1 covers V1 * T3 / 3. */
export const D3 = (V1 * T3) / 3;
/** The fewest rows the sweep passes, every draw, so every draw is seen to run through the list. */
export const MIN_RUN = 160;

/** x modulo n, never negative. */
export const mod = (x: number, n: number): number => ((x % n) + n) % n;

/** Where the sweep and the slowing take the list, fixed the moment the person drawn is known. */
export interface Plan {
  /** When the sweep starts (seconds from the press) and where the list is then. */
  t2: number;
  p2: number;
  /** Rows the sweep passes beyond V1's own pace (MIN_RUN at the least). */
  extra: number;
  /** The row the list stops on, in 0 … n - 1. */
  target: number;
}

/** A stop on nobody: from where the list was, at its pace then, easing out to a whole row. */
export interface Halt {
  t: number;
  p: number;
  to: number;
  T: number;
}

export interface Run {
  /** Where the list stood at the press. */
  p0: number;
  plan: Plan | null;
  halt: Halt | null;
}

export interface At {
  /** Position, in rows. */
  p: number;
  /** Pace, in rows a second. */
  v: number;
}

/** Before the sweep: gathering pace, then keeping it. */
export function cruise(p0: number, t: number): At {
  if (t <= 0) return { p: p0, v: 0 };
  if (t <= T1) return { p: p0 + (V1 * t * t) / (2 * T1), v: (V1 * t) / T1 };
  return { p: p0 + (V1 * T1) / 2 + V1 * (t - T1), v: V1 };
}

/**
 * The rest of the run, once the person drawn is known (`known`: seconds from the press): the sweep starts when the
 * pace is reached, or now if it already has been, and passes as many rows as it takes for the slowing to end on
 * `target` in a list of `n`.
 */
export function plan(p0: number, known: number, target: number, n: number): Plan {
  const t2 = Math.max(T1, known);
  const p2 = cruise(p0, t2).p;
  let extra = mod(target - D3 - p2 - V1 * T2, n);
  if (extra < MIN_RUN) extra += Math.ceil((MIN_RUN - extra) / n) * n;
  return { t2, p2, extra, target: mod(target, n) };
}

/** The list's position and pace `t` seconds after the press. */
export function reelAt(run: Run, t: number): At {
  if (run.halt) {
    const h = run.halt;
    if (t <= h.t) return cruise(run.p0, t);
    const s = Math.min(1, (t - h.t) / h.T);
    return { p: h.p + (h.to - h.p) * (1 - (1 - s) ** 3), v: ((3 * (h.to - h.p)) / h.T) * (1 - s) ** 2 };
  }
  const pl = run.plan;
  if (!pl || t <= pl.t2) return cruise(run.p0, t);
  const tau = t - pl.t2;
  const peak = V1 + (2 * pl.extra) / T2;
  if (tau <= T2) {
    // V1 + (peak - V1) sin²(π τ / T2): from V1 up and back to V1, passing V1 * T2 + extra rows.
    const p = pl.p2 + V1 * tau + (peak - V1) * (tau / 2 - (T2 / (4 * Math.PI)) * Math.sin((2 * Math.PI * tau) / T2));
    return { p, v: V1 + (peak - V1) * Math.sin((Math.PI * tau) / T2) ** 2 };
  }
  const p3 = pl.p2 + V1 * T2 + pl.extra;
  const s = Math.min(1, (tau - T2) / T3);
  return { p: p3 + D3 * (1 - (1 - s) ** 3), v: V1 * (1 - s) ** 2 };
}

/** Seconds from the press to the stop; Infinity while the person drawn is not known yet. */
export function endOf(run: Run): number {
  if (run.halt) return run.halt.t + run.halt.T;
  if (run.plan) return run.plan.t2 + T2 + T3;
  return Number.POSITIVE_INFINITY;
}

/** A stop on nobody from `t` seconds after the press: at least a fifth of a second, at most two, to a whole row. */
export function halt(run: Run, t: number): Halt {
  const { p, v } = reelAt(run, t);
  if (v < 0.5) return { t, p, to: Math.ceil(p), T: 0.25 };
  const to = Math.ceil(p + (v * 1.2) / 3);
  return { t, p, to, T: Math.min(2, Math.max(0.2, (3 * (to - p)) / v)) };
}
