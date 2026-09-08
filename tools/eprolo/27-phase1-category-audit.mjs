import 'dotenv/config';
import fs from 'fs';
import pg from 'pg';

// PHASE 1 — catalogue-wide hunt for generic / catch-all categories.
//
// Read-only. Moves nothing, changes nothing.
//
// Two passes, because "generic" is not one thing:
//   STRICT  - the name IS a catch-all ("Others", "Misc", "Uncategorized").
//   LOOSE   - the name CONTAINS a catch-all word ("Other Replacement Parts",
//             "Other Maintenance Products"). These are usually legitimate
//             leaf categories from CJ's own taxonomy rather than dumping
//             grounds, so they are reported separately and not lumped in.

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

const STRICT = ['other', 'others', 'misc', 'miscellaneous', 'general',
  'uncategorized', 'uncategorised', 'other products', 'others products'];

console.log('=== 1a. STRICT catch-all categories (name IS generic) ===');
const strict = await q(`
  SELECT c.id, c.name, c."parentName",
         (SELECT count(*)::int FROM "Product" p WHERE p."categoryId"=c.id) AS products,
         CASE WHEN c.id LIKE 'EPROLO-%' THEN 'EPROLO' ELSE 'CJ' END AS src
  FROM "Category" c
  WHERE lower(btrim(c.name)) = ANY($1)
  ORDER BY products DESC`, [STRICT]);
console.table(strict);

console.log('\n=== 1b. LOOSE — name CONTAINS a catch-all word ===');
const loose = await q(`
  SELECT c.id, c.name, c."parentName",
         (SELECT count(*)::int FROM "Product" p WHERE p."categoryId"=c.id) AS products,
         CASE WHEN c.id LIKE 'EPROLO-%' THEN 'EPROLO' ELSE 'CJ' END AS src
  FROM "Category" c
  WHERE (c.name ~* '\\y(other|others|misc|miscellaneous|general|uncategori[sz]ed)\\y')
    AND NOT (lower(btrim(c.name)) = ANY($1))
  ORDER BY products DESC`, [STRICT]);
console.table(loose);

const strictTotal = strict.reduce((a, r) => a + r.products, 0);
const looseTotal = loose.reduce((a, r) => a + r.products, 0);

console.log('\n=== 2. SAMPLES — 15 product names per bucket ===');
for (const c of [...strict, ...loose].filter((c) => c.products > 0)) {
  const names = await q(
    `SELECT name FROM "Product" WHERE "categoryId"=$1 ORDER BY id DESC LIMIT 15`, [c.id]);
  console.log(`\n--- ${c.src} | ${c.parentName ?? 'root'} > ${c.name}  (${c.products} products) [${c.id}] ---`);
  names.forEach((n, i) => console.log(`   ${String(i + 1).padStart(2)}. ${n.name.slice(0, 88)}`));
}

console.log('\n=== 3. CATALOGUE TOTALS ===');
const totals = await q(`SELECT count(*)::int AS total FROM "Product"`);
const withCat = await q(`SELECT count(*)::int AS n FROM "Product" WHERE "categoryId" IS NOT NULL`);
const total = totals[0].total;
console.table([{
  total_products: total,
  with_a_category: withCat[0].n,
  in_STRICT_generic_bucket: strictTotal,
  in_LOOSE_generic_named: looseTotal,
  in_specific_category: withCat[0].n - strictTotal - looseTotal,
  pct_strict_generic: ((strictTotal / total) * 100).toFixed(4) + '%',
}]);

// Parent-level fallback: products sitting on a branch node rather than a leaf.
// Not a "generic bucket" by name, but the same shape of problem — a product
// filed one level up because nothing more specific matched.
console.log('\n=== 3b. products sitting on a NON-LEAF category (parent-level fallback) ===');
const parentFallback = await q(`
  SELECT c.id, c.name, c."parentName",
         (SELECT count(*)::int FROM "Product" p WHERE p."categoryId"=c.id) AS products,
         (SELECT count(*)::int FROM "Category" k WHERE k."parentId"=c.id) AS children
  FROM "Category" c
  WHERE (SELECT count(*) FROM "Category" k WHERE k."parentId"=c.id) > 0
    AND (SELECT count(*) FROM "Product" p WHERE p."categoryId"=c.id) > 0
  ORDER BY products DESC`);
console.table(parentFallback);
console.log(`  products on non-leaf categories: ${parentFallback.reduce((a, r) => a + r.products, 0)}`);

fs.mkdirSync('tools/eprolo/moderation', { recursive: true });
fs.writeFileSync('tools/eprolo/phase1-category-audit.json', JSON.stringify(
  { at: new Date().toISOString(), strict, loose, strictTotal, looseTotal, parentFallback }, null, 2));
console.log('\nreport -> tools/eprolo/phase1-category-audit.json');
await pool.end();
