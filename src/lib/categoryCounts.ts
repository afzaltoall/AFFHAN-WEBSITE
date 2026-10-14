/**
 * Product counts from the stored per-category figures (Category.productCount,
 * refreshed daily by lib/snapshots.ts), never by counting products on a
 * request. A category's figure is its own products only; a subtree's is the
 * sum over the ids the caller has already expanded and moderated.
 *
 * Free of path aliases and other modules, so it is tested on its own
 * (tests/perf/category-counts.test.mjs).
 */
export function sumProductCounts(
  rows: ReadonlyArray<{ id: string; productCount?: number | null }>,
  ids: Iterable<string>,
): number {
  const byId = new Map(rows.map((r) => [r.id, r.productCount ?? 0]));
  let total = 0;
  for (const id of new Set(ids)) total += byId.get(id) ?? 0;
  return total;
}
