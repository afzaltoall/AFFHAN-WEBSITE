import { pool, q } from './lib.mjs';

// How many rows does the rankings query touch to return 45 products?
//
//   node tools/audit/94-rankings-query-cost.mjs
//
// /api/rankings takes 4-9s and is not cached, so every visitor to /rankings/
// waits for it; measured, the route is 0.35s without this query and 4-9s with
// it. It returns 15 groups of 3 — 45 products — so the question is what it
// reads to get there.

const rows = await q(`
  SELECT "categoryId", COUNT(*)::int AS count
  FROM "Product"
  WHERE "categoryId" IS NOT NULL
  GROUP BY "categoryId"
  ORDER BY count DESC
  LIMIT 15
`);

const total = rows.reduce((a, r) => a + r.count, 0);
console.log('The 15 biggest categories — what one page of rankings partitions over:\n');
console.log('  products   categoryId');
console.log('  ' + '-'.repeat(48));
for (const r of rows) console.log('  ' + String(r.count).padStart(8) + '   ' + r.categoryId);
console.log('  ' + '-'.repeat(48));
console.log('  ' + String(total).padStart(8) + '   TOTAL rows the window function sorts');
console.log(`\n  ...to return ${rows.length} x 3 = ${rows.length * 3} products.`);
console.log(`  That is ${Math.round(total / (rows.length * 3)).toLocaleString()} rows read per row returned.`);

// The regex is applied to every one of those rows, and cannot use an index.
const [{ count: totalProducts }] = await q(`SELECT COUNT(*)::int AS count FROM "Product"`);
const [{ count: blocked }] = await q(`SELECT COUNT(*)::int AS count FROM "ModerationLog"`);
console.log(`\n  catalogue: ${Number(totalProducts).toLocaleString()} products | ModerationLog: ${Number(blocked).toLocaleString()} rows`);

// Is there an index that would let the partition be satisfied by a scan?
const idx = await q(`
  SELECT indexname, indexdef FROM pg_indexes
  WHERE tablename = 'Product'
`);
console.log(`\n  indexes on "Product":`);
for (const i of idx) console.log('    ' + i.indexname + '  ' + i.indexdef.replace(/^.*USING /, 'USING '));

await pool.end();
