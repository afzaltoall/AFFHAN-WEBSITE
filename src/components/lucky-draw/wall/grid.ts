/**
 * The lucky draw's wall: rows of names, rolling, and one box of light that searches over them and stops on the person
 * drawn (the owner, 2026-11-11: "filled completely, the users rolling ... let it face the screen"; "not blurred ... one
 * box of light, moving everywhere, moving for real, not like magic"; "up and down too, in every direction"; "it draws
 * too quickly, as if it never searched: make it feel real"). Plain arithmetic, no three.js and no page, so a test can
 * check it (tests/lucky-draw/wall.test.mjs).
 *
 * The wall's rows each roll left at the same pace, like a ticker: row r shows, from grid column `from` on, the people
 * start, start + 1, ... in Trip ID order (wrapping round the end), and the screen shows columns p + 1 to p + cols
 * when the rows have rolled to p. At the opening, the top row starts with TRIP-26-00001 and the rows together run
 * through everyone.
 *
 * A draw, about twelve seconds: the rows gather pace and roll on steadily, about two screens of names passing, then
 * slow and stop, the new names (each row in Trip ID order again, the person the server drew among them, in their own
 * place) filling the screen. All the while one box of light searches over them: it glides from box to box, keeping its
 * way and turning now and then, bouncing off the screen's edges, so it crosses the whole wall, up, down, across and
 * corner to corner, leaving a fading trail. Once the rows are still it slows, step by step, and its last step lands on
 * the person drawn. Every step is to a box beside the last; nothing jumps.
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

/** The new stretch for the drawn person's row: from `cut` on, in Trip ID order, with them (`i` of `n`) at column `c`. */
export const stretchFor = (i: number, n: number, cut: number, c: number): Segment => ({ from: cut, start: mod(i - (c - cut), n) });

// ---- the rows' roll ----

/** The rows' steady pace at a draw (columns a second: a name crosses the screen in under four seconds, never blurred). */
export const CRUISE = 2.2;
/** Seconds the rows take to gather that pace from the press, and to come to rest from it. */
export const ACC_T = 1.4;
export const DEC_T = 3.6;
/** When the rows come to rest, seconds from the press (later only if the server answers late). */
export const STOP_AT = 9;
/** The light's last steps on the still wall, seconds from the rows' rest to its landing. */
export const TAIL_T = 3.2;

/** The rows' roll at a draw, from the press: gathering pace, steady, then coming to rest. */
export interface Roll {
  /** Where the rows were at the press, and their pace then (their slow drift). */
  from: number;
  v0: number;
  /** Their steady pace, and the seconds taken to reach it. */
  V: number;
  acc: number;
  /** When they begin to slow (seconds from the press; Infinity until it is known), and the seconds that takes. */
  td: number;
  dec: number;
}

/** A pace that changes smoothly (smoothstep: no jolt at either end), and the distance it covers (its integral). */
const ease = (s: number) => s * s * (3 - 2 * s);
const eased = (s: number) => s * s * s - (s * s * s * s) / 2;

export const startRoll = (from: number, v0: number): Roll => ({ from, v0, V: CRUISE, acc: ACC_T, td: Infinity, dec: DEC_T });

/** Where the rows are (columns) and their pace (columns a second), `t` seconds after the press. `td` is never before `acc`. */
export function rollAt(R: Roll, t: number): { p: number; v: number } {
  if (t <= 0) return { p: R.from, v: R.v0 };
  const dv = R.V - R.v0;
  if (t < R.acc) {
    const s = t / R.acc;
    return { p: R.from + R.v0 * t + dv * R.acc * eased(s), v: R.v0 + dv * ease(s) };
  }
  const steady = R.from + R.v0 * R.acc + (dv * R.acc) / 2;
  if (t < R.td) return { p: steady + R.V * (t - R.acc), v: R.V };
  const pd = steady + R.V * (R.td - R.acc);
  const s = Math.min(1, (t - R.td) / R.dec);
  return { p: pd + R.V * R.dec * (s - eased(s)), v: R.V * (1 - ease(s)) };
}

/**
 * The server has answered, `ta` seconds after the press. The rows come to rest on a whole column, `end`, chosen so
 * that the screen then shows only new names (from `cut`, the first column not yet on the screen, on); they begin to
 * slow at `td`, a moment later than planned rather than earlier, so as to stop exactly there, at about STOP_AT.
 */
export function planStop(g: Grid, R: Roll, ta: number): { td: number; end: number; cut: number } {
  const steady: Roll = { ...R, td: Infinity };
  const cut = Math.ceil(rollAt(steady, ta).p + g.cols + 1) + 1;
  const at = Math.max(STOP_AT - R.dec, ta + 0.5, R.acc);
  const endIf = (td: number) => rollAt(steady, td).p + (R.V * R.dec) / 2;
  const end = Math.max(Math.ceil(endIf(at) - 1e-9), cut - 1);
  return { td: at + (end - endIf(at)) / R.V, end, cut };
}

// ---- the box of light ----

export interface Cell {
  r: number;
  c: number;
}

export const dist = (a: Cell, b: Cell) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));

/** The eight ways the light can step, round from "right": across, corner to corner, up and down. */
export const DIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
];
const dirOf = (dr: number, dc: number) => DIRS.findIndex(([r, c]) => r === dr && c === dc);

/** The light's quickest step, while it searches (seconds), and its slowest, the last onto the person drawn. */
export const STEP_QUICK = 0.18;
export const STEP_SLOW = 0.75;

/**
 * When the light reaches its boxes, in seconds after `from` (the last one already planned) up to `end`, its landing:
 * at its searching pace, then slower and slower, each step 1.2 times the one before, the last STEP_SLOW. The slowing
 * steps are laid back from `end` (about the last 3.5 seconds); the quick ones evenly before them.
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

/**
 * The light's next box, and the way it now goes. It keeps its way (`dir`) most steps and turns a little now and then,
 * so it sweeps across the wall rather than trembling in one place; at the screen's edges it bounces off. Only a box
 * beside it that the room can see (`ok`); with a person drawn (`target`) and `left` steps after this one, only a box
 * from which they can still be reached in time, and never their own box before the last step: so it searches while it
 * has steps to spare, closes in as they run out, and its last step, and only that, lands on them.
 */
export function nextStep(cur: Cell, dir: number, target: Cell | null, left: number, ok: (c: Cell) => boolean, rnd: () => number): { cell: Cell; dir: number } {
  const at = (d: number): Cell => ({ r: cur.r + DIRS[d][0], c: cur.c + DIRS[d][1] });
  const fits = (c: Cell) => ok(c) && (!target || ((c.r !== target.r || c.c !== target.c) && dist(c, target) <= left));
  const [dr, dc] = DIRS[dir];
  const turn = rnd() < 0.72 ? 0 : (rnd() < 0.5 ? 1 : -1) * (rnd() < 0.8 ? 1 : 2);
  const side = rnd() < 0.5 ? 1 : -1;
  const order = [
    (dir + turn + 8) % 8,
    dir,
    dirOf(-dr, dc),
    dirOf(dr, -dc),
    ...[1, 2, 3].flatMap((k) => [(dir + side * k + 8) % 8, (dir - side * k + 8) % 8]),
    (dir + 4) % 8,
  ];
  for (const d of order) {
    if (d < 0) continue;
    const c = at(d);
    if (fits(c)) return { cell: c, dir: d };
  }
  // Nowhere fits: the box the room sees nearest the person drawn (never theirs early), or stay.
  let best: { cell: Cell; dir: number } | null = null;
  for (let d = 0; d < 8; d++) {
    const c = at(d);
    if (!ok(c) || (target && left > 0 && c.r === target.r && c.c === target.c)) continue;
    if (!best || (target && dist(c, target) < dist(best.cell, target))) best = { cell: c, dir: d };
  }
  return best ?? { cell: cur, dir };
}

/** The light's way: the boxes it passes through and when (seconds from the press), and, once known, its landing. */
export interface Walk {
  cells: Cell[];
  times: number[];
  dir: number;
  /** The times still to come once the server has answered (the last is the landing), and the person drawn. */
  sched: number[] | null;
  target: Cell | null;
}

export const walkStart = (cell: Cell, dir: number): Walk => ({ cells: [cell], times: [0], dir, sched: null, target: null });

/**
 * Plans the light's boxes until two lie beyond `t` (so its glide always knows where it goes next), or its landing is
 * planned. `ok(cell, at, leave)`: may the light be on that box from `at` until it leaves at `leave`?
 */
export function walkAhead(w: Walk, t: number, ok: (c: Cell, at: number, leave: number) => boolean, rnd: () => number): void {
  for (;;) {
    let ahead = 0;
    for (let k = w.times.length - 1; k >= 0 && w.times[k] > t; k--) ahead++;
    if (ahead >= 2) return;
    let at: number;
    if (w.sched) {
      if (!w.sched.length) return;
      at = w.sched.shift() as number;
    } else at = w.times[w.times.length - 1] + STEP_QUICK;
    const leave = w.sched ? (w.sched[0] ?? at) : at + STEP_QUICK;
    const left = w.sched ? w.sched.length : 99;
    const cur = w.cells[w.cells.length - 1];
    if (w.sched && left === 0 && w.target) {
      w.cells.push(w.target);
    } else {
      const s = nextStep(cur, w.dir, w.sched ? w.target : null, left, (c) => ok(c, at, leave), rnd);
      w.cells.push(s.cell);
      w.dir = s.dir;
    }
    w.times.push(at);
  }
}

/** The server's answer: the light's remaining times, ending at `landAt`, its last step onto `target`. */
export function walkLand(w: Walk, target: Cell, landAt: number): void {
  w.target = target;
  w.sched = stepTimes(w.times[w.times.length - 1], landAt);
}

/** A slower step than this: the light moves over in this time, easing in and out, and holds on its box the rest. */
export const MOVE_T = 0.24;

/**
 * Where the light is at `t`, between boxes (row and column, fractional). While it searches, a smooth glide through its
 * boxes, its pace carried from one to the next (Hermite curves with the boxes' own paces); once its steps slow, it
 * settles on each box and holds there, so the room reads the name, before it moves on (MOVE_T), the last time onto
 * the person drawn. It sets off from rest at the first box and comes to rest on the last.
 */
export function pathAt(cells: readonly Cell[], times: readonly number[], t: number): { r: number; c: number } {
  const n = cells.length;
  if (n === 1 || t <= times[0]) return { r: cells[0].r, c: cells[0].c };
  if (t >= times[n - 1]) return { r: cells[n - 1].r, c: cells[n - 1].c };
  let i = n - 2;
  while (i > 0 && times[i] > t) i--;
  const h = times[i + 1] - times[i];
  if (h > MOVE_T) {
    const s = Math.min(1, Math.max(0, (t - (times[i + 1] - MOVE_T)) / MOVE_T));
    const e = s * s * s * (s * (s * 6 - 15) + 10);
    return { r: cells[i].r + (cells[i + 1].r - cells[i].r) * e, c: cells[i].c + (cells[i + 1].c - cells[i].c) * e };
  }
  const u = h > 0 ? (t - times[i]) / h : 1;
  // A box next to a slow step is arrived at, or left, from rest.
  const holds = (k: number) => (k > 0 && times[k] - times[k - 1] > MOVE_T) || (k < n - 1 && times[k + 1] - times[k] > MOVE_T);
  const pace = (k: number, key: "r" | "c") => (k <= 0 || k >= n - 1 || holds(k) ? 0 : (cells[k + 1][key] - cells[k - 1][key]) / (times[k + 1] - times[k - 1]));
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  const at = (key: "r" | "c") => h00 * cells[i][key] + h10 * h * pace(i, key) + h01 * cells[i + 1][key] + h11 * h * pace(i + 1, key);
  return { r: at("r"), c: at("c") };
}
