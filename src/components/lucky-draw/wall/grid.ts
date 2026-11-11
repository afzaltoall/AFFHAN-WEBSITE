/**
 * The lucky draw's wall: rows of golden tickets, one for everyone in the draw, and one light that searches over them
 * and stops on the person drawn (the owner, 2026-11-11: "filled completely ... curved, facing the screen"; "one box
 * of light, moving everywhere, for real, not like magic"; "up and down too"; "not like a mouse drag or a slideshow:
 * card to card, snap"; "make the cards tickets ... six rows ... a Ballon d'Or gold feel"). Plain arithmetic, no
 * three.js and no page, so a test can check it (tests/lucky-draw/wall.test.mjs).
 *
 * The wall's rows each roll slowly left while it waits, like a ticker: row r shows, from grid column `from` on, the
 * people start, start + 1, ... in Trip ID order (wrapping round the end), and the screen shows columns p + 1 to
 * p + cols when the rows have rolled to p. At the opening, the top row starts with TRIP-26-00001.
 *
 * A draw, about ten seconds, the wall still throughout: the tickets turn face down in a wave, their gold backs showing
 * while the server draws; they turn face up again with new names (each row in Trip ID order from a new place, the
 * person drawn among them, in their own place), as a dealer shuffles a deck. Then the light comes on and jumps from
 * ticket to ticket, a snap each time, across, up, down and corner to corner, keeping its way and bouncing off the
 * screen's edges; it slows, holding on each name, and its last jump lands on the person drawn.
 */

export interface Grid {
  /** Tickets across the screen. */
  cols: number;
  /** A ticket's size, and the step to the next one across and down (world units). */
  tileW: number;
  tileH: number;
  pitchX: number;
  pitchY: number;
  /** The radius of the wall's curve towards the room (world units): gentle, so every ticket faces the room. */
  curve: number;
}

/** Tickets 2.67 times as wide as they are tall, as a ticket is. */
export const GRID: Grid = { cols: 8, tileW: 1.6, tileH: 0.6, pitchX: 1.76, pitchY: 0.7, curve: 26 };
/** Rows of tickets on the screen (the owner: "six rows"), fewer only where six cannot fit. */
export const ROWS = 6;

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

/** A row's new stretch: from column `from` on, in Trip ID order, with person `i` of `n` at column `c`. */
export const stretchFor = (i: number, n: number, from: number, c: number): Segment => ({ from, start: mod(i - (c - from), n) });

// ---- the shuffle ----

/** Seconds a ticket takes to turn over, and how long the wave takes to cross the wall (first ticket to last). */
export const FLIP_T = 0.5;
export const WAVE_T = 0.6;
/** The face-down wave starts this long after the press; the gold backs then show for at least BACKS_T. */
export const DOWN_AT = 0.05;
export const BACKS_T = 0.45;
/** Seconds from the tickets' last turn face up to the light coming on, and from then to its landing. */
export const LIGHT_GAP = 0.15;
export const CHASE_T = 7;

/** When the wave reaches a ticket (seconds after it starts): a diagonal sweep from the top left to the bottom right. */
export function flipDelay(r: number, k: number, rows: number, cols: number): number {
  const span = Math.max(1, rows - 1 + cols + 1);
  return (WAVE_T * Math.min(span, Math.max(0, r + k))) / span;
}

/** A ticket's turn, in radians (0 face up, π face down, 2π face up again), at `t`, for waves starting at `down` and `up`. */
export function flipAngle(t: number, down: number, up: number, delay: number): number {
  const turn = (start: number) => {
    const s = Math.min(1, Math.max(0, (t - start - delay) / FLIP_T));
    return s * s * (3 - 2 * s);
  };
  return Math.PI * (turn(down) + (Number.isFinite(up) ? turn(up) : 0));
}

/**
 * The draw's moments once the server has answered, `ta` seconds after the press: the face-up wave (after every ticket
 * is face down and the backs have shown a moment), the light coming on, and its landing.
 */
export function drawTimes(ta: number): { up: number; light: number; land: number } {
  const up = Math.max(DOWN_AT + WAVE_T + FLIP_T + BACKS_T, ta + 0.25);
  const light = up + WAVE_T + FLIP_T + LIGHT_GAP;
  return { up, light, land: light + CHASE_T };
}

/** Seconds from the press until every ticket is face down (the new names can then be put in, unseen). */
export const ALL_DOWN = DOWN_AT + WAVE_T + FLIP_T;

// ---- the light ----

export interface Cell {
  r: number;
  c: number;
}

export const dist = (a: Cell, b: Cell) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));

/** The eight ways the light can jump, round from "right": across, corner to corner, up and down. */
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

/** The light's quickest jumps (nine a second), its slowest (the last, onto the person drawn), and how each slows. */
export const STEP_QUICK = 0.11;
export const STEP_SLOW = 0.75;
const SLOWING = 1.17;
/** The jump itself: this long, easing in and out; the rest of each step the light holds on its ticket. */
export const MOVE_T = 0.06;

/**
 * When the light reaches its tickets, in seconds after `from` (where it is) up to `end`, its landing: quick at first,
 * then slower and slower, each step SLOWING times the one before, the last STEP_SLOW. The slowing steps are laid back
 * from `end`; the quick ones evenly before them.
 */
export function stepTimes(from: number, end: number): number[] {
  const tail: number[] = [end];
  let at = end;
  let gap = STEP_SLOW;
  while (gap > STEP_QUICK * 1.05 && at - gap > from + STEP_QUICK) {
    at -= gap;
    tail.unshift(at);
    gap /= SLOWING;
  }
  const span = at - from;
  const k = Math.max(0, Math.round(span / STEP_QUICK) - 1);
  const quick = Array.from({ length: k }, (_, i) => from + (span * (i + 1)) / (k + 1));
  return [...quick, ...tail];
}

/**
 * The light's next ticket, and the way it now goes. It keeps its way (`dir`) most jumps and turns a little now and
 * then, so it sweeps across the wall rather than trembling in one place; at the screen's edges it bounces off. Only a
 * ticket beside it that the room can see (`ok`); with a person drawn (`target`) and `left` jumps after this one, only
 * a ticket from which they can still be reached in time, and never their own before the last jump: so it searches
 * while it has jumps to spare, closes in as they run out, and its last jump, and only that, lands on them.
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
  // Nowhere fits: the ticket the room sees nearest the person drawn (never theirs early), or stay.
  let best: { cell: Cell; dir: number } | null = null;
  for (let d = 0; d < 8; d++) {
    const c = at(d);
    if (!ok(c) || (target && left > 0 && c.r === target.r && c.c === target.c)) continue;
    if (!best || (target && dist(c, target) < dist(best.cell, target))) best = { cell: c, dir: d };
  }
  return best ?? { cell: cur, dir };
}

/** The light's way: the tickets it lands on and when (seconds from the press), and its landing. */
export interface Walk {
  cells: Cell[];
  times: number[];
  dir: number;
  /** The times still to come (the last is the landing), and the person drawn. */
  sched: number[];
  target: Cell;
}

/** The light comes on at `cell` at `at` and will land on `target` at `land`. */
export const walkStart = (cell: Cell, dir: number, at: number, target: Cell, land: number): Walk => ({
  cells: [cell],
  times: [at],
  dir,
  sched: stepTimes(at, land),
  target,
});

/** Plans the light's tickets until two lie beyond `t` (so it always knows where it jumps next), or its landing. */
export function walkAhead(w: Walk, t: number, ok: (c: Cell) => boolean, rnd: () => number): void {
  for (;;) {
    let ahead = 0;
    for (let k = w.times.length - 1; k >= 0 && w.times[k] > t; k--) ahead++;
    if (ahead >= 2 || !w.sched.length) return;
    const at = w.sched.shift() as number;
    const left = w.sched.length;
    if (left === 0) w.cells.push(w.target);
    else {
      const s = nextStep(w.cells[w.cells.length - 1], w.dir, w.target, left, ok, rnd);
      w.cells.push(s.cell);
      w.dir = s.dir;
    }
    w.times.push(at);
  }
}

/**
 * Where the light is at `t` (row and column, fractional): on a ticket, and at each of its times a jump to the next,
 * MOVE_T long, easing in and out, so it snaps from ticket to ticket and holds on each (never a slow drag).
 */
export function pathAt(cells: readonly Cell[], times: readonly number[], t: number): { r: number; c: number } {
  const n = cells.length;
  if (n === 1 || t <= times[0]) return { r: cells[0].r, c: cells[0].c };
  if (t >= times[n - 1]) return { r: cells[n - 1].r, c: cells[n - 1].c };
  let i = n - 2;
  while (i > 0 && times[i] > t) i--;
  const move = Math.min(MOVE_T, times[i + 1] - times[i]);
  const s = Math.min(1, Math.max(0, (t - (times[i + 1] - move)) / move));
  const e = s * s * (3 - 2 * s);
  return { r: cells[i].r + (cells[i + 1].r - cells[i].r) * e, c: cells[i].c + (cells[i + 1].c - cells[i].c) * e };
}

/** Which jump the light is on at `t` (it changes the moment a jump begins): for its flash. */
export function stepIndex(times: readonly number[], t: number): number {
  let i = 0;
  while (i + 1 < times.length && t >= times[i + 1] - MOVE_T) i++;
  return i;
}
