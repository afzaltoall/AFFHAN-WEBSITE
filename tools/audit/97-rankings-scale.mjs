import { pool, q } from './lib.mjs';
import { BLOCKED_CATEGORY_PATTERNS, BLOCKED_NAME_KEYWORDS } from './rules.mjs';

// How big would /rankings/ be with no pagination at all?
//
//   node tools/audit/97-rankings-scale.mjs
//
// The page currently shows 15 category cards and loads 15 more on scroll.
// "Remove pagination" means rendering every eligible category at once, so the
// first question is how many that is — the answer decides whether this is a
// layout change or a page-weight problem.

const cats = await q(`SELECT id, name, "parentId" FROM "Category"`);
const counts = await q(`
  SELECT "categoryId", COUNT(*)::int AS count
  FROM "Product" WHERE "categoryId" IS NOT NULL
  GROUP BY "categoryId" ORDER BY count DESC
`);

// Same descendant-aware blocking the route applies.
const byId = new Map(cats.map((c) => [c.id, c]));
const isBlockedName = (n) => BLOCKED_CATEGORY_PATTERNS.some((p) => (n || '').toLowerCase().includes(p));
const blocked = new Set();
for (const c of cats) {
  let cur = c;
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (isBlockedName(cur.name)) { blocked.add(c.id); break; }
    cur = cur.parentId ? byId.get(cur.parentId) : null;
  }
}

const eligible = counts.filter((r) => byId.has(r.categoryId) && !blocked.has(r.categoryId));

console.log('CATEGORIES THE RANKINGS PAGE WOULD RENDER\n');
console.log(`  categories in the tree          : ${cats.length}`);
console.log(`  with at least one product       : ${counts.length}`);
console.log(`  blocked (moderation, descendant): ${counts.length - eligible.length}`);
console.log(`  ELIGIBLE ranking cards          : ${eligible.length}`);
console.log(`\n  at 3 products per card, unpaginated: ${eligible.length * 3} products, ${eligible.length * 3} images`);
console.log(`  currently on first paint          : 15 cards, 45 products`);
console.log(`  so "no pagination" is ${(eligible.length / 15).toFixed(1)}x the current first screen`);

// A card only renders if it has >= 1 product surviving the name regex, so the
// eligible count is an upper bound; how many are tiny?
const tiny = eligible.filter((r) => r.count < 3).length;
console.log(`\n  eligible cards with fewer than 3 products: ${tiny}`);

await pool.end();
