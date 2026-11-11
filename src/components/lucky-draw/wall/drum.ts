import type { DrawCardPublic, DrawPoolEntry } from "@/lib/lucky-draw-shared";

/**
 * Who is on the lucky draw's wall (DrawWall), in what order, and where a Trip ID is on it. Plain arithmetic, no three.js
 * and no page, so a test can check it (tests/lucky-draw/wall.test.mjs). Where the names are on the screen, and how
 * they move, is ./grid.ts.
 */

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
