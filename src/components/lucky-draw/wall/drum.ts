import type { DrawCardPublic, DrawPoolEntry } from "@/lib/lucky-draw-shared";

/**
 * The lucky draw's wall (DrawWall): everyone in the draw as a tile on a turning drum, one long spiral of tiles in Trip
 * ID order (the owner, 2026-11-11, with four pictures of video walls: "this style, animated, innovative"). Plain
 * arithmetic, no three.js and no page, so a test can check it (tests/lucky-draw/wall.test.mjs).
 *
 * A position is a place in that order, counted as ./reel.ts counts the list's rows: the tile of person i is in the
 * gold frame when the position is exactly i (modulo how many are on the wall). The tile j places after the frame's is
 * j/perTurn of a turn round the drum, so the names run along the frame's row, and go on in the row below once they are
 * round the back of the drum (where nobody sees a tile change rows; the rows stay level). A turning drum brings every
 * one of them past the frame in order, none skipped.
 */
export interface Drum {
  /** Tiles in one turn of the spiral. */
  perTurn: number;
  /** A tile's size, and the step to the next one along and to the row below (world units). */
  tileW: number;
  tileH: number;
  pitchX: number;
  pitchY: number;
  /** The drum's radius: perTurn tiles round it. */
  radius: number;
}

export function drumOf(perTurn = 32, tileW = 1.6, tileH = 0.9, gapX = 0.14, gapY = 0.16): Drum {
  const pitchX = tileW + gapX;
  return { perTurn, tileW, tileH, pitchX, pitchY: tileH + gapY, radius: (perTurn * pitchX) / (2 * Math.PI) };
}

export const DRUM: Drum = drumOf();

/** The row a tile `j` places after the frame's is in (0 the frame's, 1 the one below): it changes at the drum's back. */
export const rowOf = (d: Drum, j: number) => Math.floor(j / d.perTurn + 0.5);

/**
 * Where a tile is when it is `j` places after the one in the frame (j fractional while the drum turns): its angle round
 * the drum (0 faces the room), its centre, and how squarely it faces the room (1 head on, 0 edge on, below 0 behind).
 * The same arithmetic as the drum's shader (./stage.ts).
 */
export function placeOf(d: Drum, j: number) {
  const angle = (2 * Math.PI * j) / d.perTurn;
  return { angle, x: d.radius * Math.sin(angle), y: -d.pitchY * rowOf(d, j), z: d.radius * (Math.cos(angle) - 1), facing: Math.cos(angle) };
}

/** Trip IDs in the draw's order (plain character order, as lucky-draw-shared compares them). */
const byTripId = (a: DrawPoolEntry, b: DrawPoolEntry) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

export interface WallList {
  /** Everyone on the wall, in Trip ID order. */
  entries: DrawPoolEntry[];
  /** The winners among them (drawn, still holding a seat in some round): their tiles are gold. */
  gold: Set<string>;
}

/**
 * Who is on the wall: everyone who can be drawn (the pool), and everyone drawn who still holds a seat, in any round,
 * whose tile stays on the wall in gold. Someone released (can't take part) or taken out leaves the wall, as they left
 * the list before.
 */
export function wallOf(pool: readonly DrawPoolEntry[], cards: readonly DrawCardPublic[]): WallList {
  const byId = new Map<string, DrawPoolEntry>();
  for (const e of pool) byId.set(e[0], e);
  const gold = new Set<string>();
  for (const c of cards) {
    if (c.out || c.seat === null) continue;
    gold.add(c.tripId);
    if (!byId.has(c.tripId)) byId.set(c.tripId, [c.tripId, c.name, c.city, c.country]);
  }
  return { entries: [...byId.values()].sort(byTripId), gold };
}

/** Where a Trip ID is on the wall, or would be: the first place at or after it. */
export function placeOfTrip(entries: readonly DrawPoolEntry[], tripId: string): number {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (entries[m][0] < tripId) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/**
 * The next person after place `i` who can still be drawn (not gold), going on round the wall; `i` itself when nobody
 * else can. Where the frame rests once a winner's name has gone down to their seat (the owner: "so next person").
 */
export function nextFree(entries: readonly DrawPoolEntry[], gold: ReadonlySet<string>, i: number): number {
  const n = entries.length;
  if (!n) return 0;
  for (let k = 1; k <= n; k++) {
    const at = (((i + k) % n) + n) % n;
    if (!gold.has(entries[at][0])) return at;
  }
  return (((i % n) + n) % n);
}

/**
 * Whether a tile `j` places from the frame shows its words: only near the front of the drum, in the frame's row and
 * the rows either side, where they can be read. Elsewhere it is glass and light, as the far side of a video wall is.
 */
export function shows(d: Drum, j: number): boolean {
  const row = rowOf(d, j);
  const angle = (2 * Math.PI * (j - row * d.perTurn)) / d.perTurn;
  return Math.abs(angle) < 1.25 && Math.abs(row) <= 1;
}

/** 0 at rest to 1 at speed (tiles a second): the words fade as the drum gathers pace and come back as it slows. */
export function blur(speed: number): number {
  const s = Math.min(1, Math.max(0, (Math.abs(speed) - 9) / 9));
  return s * s * (3 - 2 * s);
}
