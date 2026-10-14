// A subtree's product count from the stored per-category figures (src/lib/categoryCounts.ts), which replace a
// COUNT(*) on every category page: the sum over the ids asked for, each once, and nothing for unknown ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sumProductCounts } from "../../src/lib/categoryCounts.ts";

const rows = [
  { id: "phones", productCount: 0 }, // a branch: CJ files products on the leaves only
  { id: "cables", productCount: 1200 },
  { id: "chargers", productCount: 340 },
  { id: "eprolo-branch", productCount: 7 }, // EPROLO does file some on branches
  { id: "never-counted", productCount: null },
];

test("the sum over the ids asked for", () => {
  assert.equal(sumProductCounts(rows, ["phones", "cables", "chargers"]), 1540);
  assert.equal(sumProductCounts(rows, ["eprolo-branch", "cables"]), 1207);
});

test("an id twice counts once, an unknown or uncounted one as nothing", () => {
  assert.equal(sumProductCounts(rows, ["cables", "cables"]), 1200);
  assert.equal(sumProductCounts(rows, ["gone", "never-counted", "chargers"]), 340);
  assert.equal(sumProductCounts(rows, []), 0);
});

test("any iterable of ids, a Set as the catalogue builds them", () => {
  assert.equal(sumProductCounts(rows, new Set(["cables", "chargers"])), 1540);
});
