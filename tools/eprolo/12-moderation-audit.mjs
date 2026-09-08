import 'dotenv/config';
import fs from 'fs';
import pg from 'pg';

// Content-moderation audit across the whole catalogue, both suppliers.
//
// Word-boundary regex throughout, deliberately. A naive '%sex%' matches
// "Unisex Dresses", "Unisex Hoodies & Sweatshirts", "Unisex Jeans" and
// "Unisex Wallets" — 2,400+ entirely legitimate products that must not be
// caught up in this. Postgres \y is the boundary operator, and "unisex" has no
// boundary before "sex", so \ysex\y excludes them correctly.

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

// Split into confirmed vs needs-review so the report can say which is which.
const CONFIRMED = `(\\ysex\\y|\\ysexual\\y|sex product|sex toy|sex doll)`;
const BROADER = `(\\yadult\\y|\\yerotic\\y|\\yfetish\\y|\\yporn\\y|bondage|vibrator|\\ycondom\\y|\\yintimate\\y|lingerie|\\ybdsm\\y|masturb|orgasm|aphrodisiac)`;

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows, cols) =>
  [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');

// ---------------------------------------------------------------- categories
const cats = await q(`
  SELECT c.id, c.name, c."parentName", c."parentId", c."displayAsTopLevel",
         (SELECT count(*)::int FROM "Product" p WHERE p."categoryId" = c.id) AS "productCount",
         (c.name ~* $1) AS confirmed,
         (c.name ~* $2) AS broader
  FROM "Category" c
  WHERE c.name ~* $1 OR c.name ~* $2
  ORDER BY confirmed DESC, "productCount" DESC, c.name`, [CONFIRMED, BROADER]);

console.log('=== CATEGORIES MATCHING ADULT KEYWORDS (word-boundary) ===');
console.table(cats.map((c) => ({
  id: c.id, name: c.name, parent: c.parentName,
  products: c.productCount, tier: c.confirmed ? 'CONFIRMED' : 'needs-review',
})));

// ---------------------------------------------------------------- products
// Everything in a matched category, plus anything whose own NAME matches while
// filed elsewhere — mis-filed adult items are exactly what slips through.
const catIds = cats.map((c) => c.id);
const products = catIds.length ? await q(`
  SELECT p.id, p."cjPid", p.name, p."supplierSource", p."categoryId",
         c.name AS "categoryName", c."parentName" AS "categoryParent",
         p."lastSynced" AS "dateAdded",
         'in-blocked-category' AS "matchReason"
  FROM "Product" p LEFT JOIN "Category" c ON c.id = p."categoryId"
  WHERE p."categoryId" = ANY($1)
  UNION
  SELECT p.id, p."cjPid", p.name, p."supplierSource", p."categoryId",
         c.name, c."parentName", p."lastSynced",
         'product-name-match' AS "matchReason"
  FROM "Product" p LEFT JOIN "Category" c ON c.id = p."categoryId"
  WHERE p.name ~* $2 AND (p."categoryId" IS NULL OR NOT (p."categoryId" = ANY($1)))
  ORDER BY "supplierSource", "categoryName", id`, [catIds, CONFIRMED]) : [];

console.log(`\n=== PRODUCTS IMPLICATED: ${products.length} ===`);
const bySrc = {};
for (const p of products) {
  const k = `${p.supplierSource} / ${p.categoryName ?? '(no category)'} / ${p.matchReason}`;
  bySrc[k] = (bySrc[k] ?? 0) + 1;
}
for (const [k, v] of Object.entries(bySrc).sort((a, b) => b[1] - a[1])) console.log(`  ${v}x  ${k}`);

// ---------------------------------------------------------------- when
console.log('\n=== WHEN WERE THEY ADDED? ===');
console.table(await q(`
  SELECT p."supplierSource", date_trunc('day', p."lastSynced")::date AS day, count(*)::int
  FROM "Product" p WHERE p."categoryId" = ANY($1)
  GROUP BY 1,2 ORDER BY 2 DESC, 3 DESC LIMIT 10`, [catIds]));

// ---------------------------------------------------------------- write
fs.mkdirSync('tools/eprolo/moderation', { recursive: true });
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

const pCols = ['id', 'cjPid', 'name', 'supplierSource', 'categoryId', 'categoryName',
  'categoryParent', 'dateAdded', 'matchReason'];
const cCols = ['id', 'name', 'parentName', 'productCount', 'confirmed', 'broader', 'displayAsTopLevel'];

const pFile = `tools/eprolo/moderation/flagged-products-${stamp}.csv`;
const cFile = `tools/eprolo/moderation/flagged-categories-${stamp}.csv`;
fs.writeFileSync(pFile, toCsv(products, pCols));
fs.writeFileSync(cFile, toCsv(cats, cCols));

console.log(`\nwrote ${products.length} product rows -> ${pFile}`);
console.log(`wrote ${cats.length} category rows -> ${cFile}`);

await pool.end();
