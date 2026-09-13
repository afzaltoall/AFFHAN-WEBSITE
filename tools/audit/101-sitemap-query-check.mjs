import { pool, q } from './lib.mjs';
import { BLOCKED_CATEGORY_PATTERNS, BLOCKED_NAME_KEYWORDS } from './rules.mjs';

// Does the product-sitemap query select what it should?
//
//   node tools/audit/101-sitemap-query-check.mjs
//
// Mirrors src/app/products/sitemap.ts so the count and the exclusions can be
// checked without a deploy. The exclusions are the point: a sitemap that
// advertises a page taken down by hand is worse than no sitemap at all.

const regex = `\y(${BLOCKED_NAME_KEYWORDS.map((k) => k.replace(/[-\s]/g, '[- ]?')).join('|')})(?:e?s)?\y`;

// Descendant-aware blocked categories, same as blockedCategoryIdSet.
const cats = await q(`SELECT id, name, "parentId" FROM "Category"`);
const byId = new Map(cats.map((c) => [c.id, c]));
const hit = (n) => BLOCKED_CATEGORY_PATTERNS.some((p) => (n || '').toLowerCase().includes(p));
const blocked = [];
for (const c of cats) {
  let cur = c; const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (hit(cur.name)) { blocked.push(c.id); break; }
    cur = cur.parentId ? byId.get(cur.parentId) : null;
  }
}

const params = [regex, ...blocked];
const catClause = blocked.length
  ? `AND p."categoryId" NOT IN (${blocked.map((_, i) => `$${i + 2}`).join(',')})`
  : '';

// Each query gets only the parameters it actually references; passing the
// full list to one with no placeholders is a bind error, not a no-op.
const step = async (label, sql, args = []) => {
  const [r] = await q(sql, args);
  console.log('  ' + label.padEnd(46) + String(r.n).padStart(9));
  return r.n;
};

console.log('PRODUCT SITEMAP QUERY — what each filter removes\n');
await step('EPROLO products', `SELECT COUNT(*)::int AS n FROM "Product" p WHERE p."supplierSource" = 'EPROLO'`);
await step('  + has a description', `SELECT COUNT(*)::int AS n FROM "Product" p WHERE p."supplierSource"='EPROLO' AND p."description" IS NOT NULL`);
await step('  + description longer than 200 chars', `SELECT COUNT(*)::int AS n FROM "Product" p WHERE p."supplierSource"='EPROLO' AND length(p."description") > 200`);
await step('  + name not matching blocked regex', `SELECT COUNT(*)::int AS n FROM "Product" p WHERE p."supplierSource"='EPROLO' AND length(p."description")>200 AND p."name" !~* $1`, [regex]);
await step('  + category not blocked', `SELECT COUNT(*)::int AS n FROM "Product" p WHERE p."supplierSource"='EPROLO' AND length(p."description")>200 AND p."name" !~* $1 ${catClause}`, params);
const final = await step('  + not in ModerationLog  = FINAL', `
  SELECT COUNT(*)::int AS n FROM "Product" p
  WHERE p."supplierSource"='EPROLO' AND length(p."description")>200 AND p."name" !~* $1 ${catClause}
    AND NOT EXISTS (SELECT 1 FROM "ModerationLog" m WHERE m."cjPid" = p."cjPid")`, params);

console.log(`\n  sitemap files at 45,000 urls each: ${Math.max(1, Math.ceil(final / 45000))}`);

// Spot-check that the urls resolve, rather than trusting the count.
const sample = await q(`
  SELECT p."id" FROM "Product" p
  WHERE p."supplierSource"='EPROLO' AND length(p."description")>200 AND p."name" !~* $1 ${catClause}
    AND NOT EXISTS (SELECT 1 FROM "ModerationLog" m WHERE m."cjPid" = p."cjPid")
  ORDER BY random() LIMIT 5`, params);
console.log('\n  spot-checking 5 of the selected urls against production:');
for (const { id } of sample) {
  const url = `https://affhan.com/products/${id}/`;
  try {
    const res = await fetch(url, { redirect: 'manual' });
    console.log(`    ${String(res.status).padEnd(4)} ${url}`);
  } catch (e) { console.log(`    ERR  ${url}  ${e.message}`); }
}

await pool.end();
