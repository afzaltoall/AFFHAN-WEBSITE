/**
 * The lucky draw's wall: a full screen of names, rolling, and one box of light that runs over them and stops on the
 * person drawn (the owner, 2026-11-11: "filled completely, the users rolling ... let it face the screen"; "not
 * blurred, the background real; one box of light, moving everywhere, moving for real, not like magic, choosing one
 * candidate"). Plain arithmetic, no three.js and no page, so a test can check it (tests/lucky-draw/wall.test.mjs).
 *
 * The wall's rows each roll left at the same pace, like a ticker: row r shows, from grid column `from` on, the people
 * start, start + 1, ... in Trip ID order (wrapping round the end), and the screen shows columns p + 1 to p + cols
 * when the rows have rolled to p. At the opening, the top row starts with TRIP-26-00001 and the rows together run
 * through everyone.
 *
 * A draw: the rows roll on by one screen, calmly, never too fast to see, bringing a new screen of names in from the
 * right (each row's names in Trip ID order again, the person the server drew among them, in their own place); one
 * box of light runs from box to box all over the screen meanwhile, quick while the rows roll, then, once they are
 * still, ever slower, and its last step lands on the person drawn. Every step is to a box beside the last (across, up,
 * down or corner to corner), and the light glides there: nothing jumps.
 */

export interface Grid {
  /** Tiles across the screen. */
  cols: number;
  /** A tile's size, and the step to the next one across and down (world units). */
  tileW: number;
  tileH: number;
  pitchX: number;
  pitchY: number;
  /** The radius of the wall's curve towards the room (world units): gentle, so every tile faces the room. */
  curve: number;
}

export const GRID: Grid = { cols: 8, tileW: 1.6, tileH: 0.9, pitchX: 1.76, pitchY: 1.06, curve: 26 };

/** x modulo n, never negative. */
export const mod = (x: number, n: number): number => ((x % n) + n) % n;

/** Where column c is across the screen, flat (the middle is 0), when the rows have rolled to p. */
export const flatX = (g: Grid, c: number, p: number) => (c - p - (g.cols + 1) / 2) * g.pitchX;

/** A stretch of a row: from grid column `from` on, the people `start`, start + 1, ... (wrapping round). */
export interface Segment {
  from: number;
  start: number;
}

/** Who is in row `segments`, column c, of `n` on the wall: its latest stretch that began at or before c. */
export function personAt(segments: readonly Segment[], c: number, n: number): number {
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (c >= s.from) return mod(s.start + c - s.from, n);
  }
  const s = segments[0];
  return mod(s.start + c - s.from, n);
}

/**
 * The rows as the wall opens, rolled to p (rows numbered from 0 at the top): the top row starts with person 0 at the
 * first column on the screen, and each row after starts where its share of everyone begins, so the rows together run
 * through everyone.
 */
export function openingRows(count: number, n: number, p: number): Segment[][] {
  const share = Math.max(1, Math.ceil(n / Math.max(1, count)));
  const from = Math.floor(p) + 1;
  return Array.from({ length: count }, (_, i) => [{ from, start: mod(i * share, n) }]);
}

/** Seconds the rows take to roll on by a screen at a draw, and the light's last stretch on the still wall after. */
export const ROLL_T = 3.6;
export const TAIL_T = 2.6;

/**
 * The rows' roll at a draw, `t` seconds after it begins: smoothly to rest at `to` (smootherstep), never faster than
 * 1.875 x its mean pace; `v0`, the slow pace the rows had as it began, is carried on and let go, so they never jerk.
 */
export function rollAt(from: number, to: number, t: number, v0 = 0): { p: number; v: number } {
  const s = Math.min(1, Math.max(0, t / ROLL_T));
  const e = s * s * s * (s * (s * 6 - 15) + 10);
  const de = 30 * s * s * (s - 1) * (s - 1);
  // h(0) = 0, h'(0) = 1, h(1) = h'(1) = 0: the first pace, gone by the end.
  const h = s * (1 - s) ** 3;
  const dh = (1 - s) ** 2 * (1 - 4 * s);
  return { p: from + (to - from) * e + v0 * ROLL_T * h, v: ((to - from) * de) / ROLL_T + v0 * dh };
}

/**
 * Where the rows roll to at a draw, from `p` (where they are when the server answers): `cut` is the first column not
 * yet on the screen (from it on, every row shows new names), `end` where they stop (a whole column), so that the
 * screen then shows only new names; `extra` (0, 1 or 2) varies how far.
 */
export function rollPlan(g: Grid, p: number, extra: number): { cut: number; end: number } {
  const cut = Math.ceil(p + g.cols + 1) + 1;
  return { cut, end: cut - 1 + extra };
}

/**
 * The new stretch for the drawn person's row: from `cut` on, in Trip ID order, with them (`i` of `n`) at column `c`.
 */
export const stretchFor = (i: number, n: number, cut: number, c: number): Segment => ({ from: cut, start: mod(i - (c - cut), n) });

/** The light's quickest step (13 a second, while the rows roll) and its slowest (the last, onto the person drawn). */
export const STEP_QUICK = 0.075;
export const STEP_SLOW = 0.5;

/**
 * When the light steps, in seconds, from `from` (the server's answer) to `end` (its last step, onto the person drawn):
 * quick all the while the rows roll, so it keeps up with the names however fast they pass; then, on the still wall,
 * slower and slower, each step 1.2 times the one before, the last half a second. The slowing steps are laid back from
 * `end` (about TAIL_T seconds of them); the quick ones evenly before.
 */
export function stepTimes(from: number, end: number): number[] {
  const tail: number[] = [end];
  let at = end;
  let gap = STEP_SLOW;
  while (gap > STEP_QUICK * 1.05 && at - gap > from + STEP_QUICK) {
    at -= gap;
    tail.unshift(at);
    gap /= 1.2;
  }
  const span = at - from;
  const k = Math.max(0, Math.round(span / STEP_QUICK) - 1);
  const quick = Array.from({ length: k }, (_, i) => from + (span * (i + 1)) / (k + 1));
  return [...quick, ...tail];
}

export interface Cell {
  r: number;
  c: number;
}

const dist = (a: Cell, b: Cell) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));

/**
 * The light's next box: one beside it (across, up, down or corner to corner) that the room can see (`ok`), never the
 * one it has just left when it has another choice. With a person drawn (`target`) and `left` steps after this one,
 * only boxes from which they can still be reached in time, and never their own box before the last step: so it
 * wanders while it has steps to spare, heads for them as its steps run out, and its last step, and only that, lands on
 * them. (On a wall of two rows or more, a box beside them always has a neighbour beside them too, to wait on.)
 */
export function nextCell(cur: Cell, prev: Cell | null, target: Cell | null, left: number, ok: (c: Cell) => boolean, rnd: () => number): Cell {
  const near: Cell[] = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) near.push({ r: cur.r + dr, c: cur.c + dc });
  let pool = near.filter(ok);
  if (target) {
    if (left <= 0 && dist(cur, target) <= 1) return target;
    const off = pool.filter((c) => c.r !== target.r || c.c !== target.c);
    const inTime = off.filter((c) => dist(c, target) <= left);
    if (inTime.length) pool = inTime;
    else if (off.length) {
      const best = Math.min(...off.map((c) => dist(c, target)));
      pool = off.filter((c) => dist(c, target) === best);
    }
  }
  if (!pool.length) return cur;
  const away = pool.filter((c) => !prev || c.r !== prev.r || c.c !== prev.c);
  const from = away.length ? away : pool;
  return from[Math.floor(rnd() * from.length) % from.length];
}
