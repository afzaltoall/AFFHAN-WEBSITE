import 'dotenv/config';
import pg from 'pg';
import { isCategoryBlocked } from './moderation.mjs';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

const cats = await q(`SELECT id, name, "parentId", "parentName", "thumbnailUrl" FROM "Category"`);
const byId = new Map(cats.map((c) => [c.id, c]));
const blockedDeep = (id, seen = new Set()) => {
  if (seen.has(id)) return false;
  seen.add(id);
  const c = byId.get(id);
  if (!c) return false;
  return isCategoryBlocked(c.name) || (c.parentId ? blockedDeep(c.parentId, seen) : false);
};

console.log('=== 1. INTEGRITY: no product orphaned by the merge ===');
console.table(await q(`SELECT
  count(*) FILTER (WHERE "categoryId" IS NULL)::int AS null_category,
  count(*) FILTER (WHERE "categoryId" IS NOT NULL
    AND "categoryId" NOT IN (SELECT id FROM "Category"))::int AS dangling_categoryid,
  count(*)::int AS total
  FROM "Product" WHERE "supplierSource"='EPROLO'`));

console.log('=== 2. counts unchanged ===');
console.table(await q(`SELECT "supplierSource", count(*)::int FROM "Product" GROUP BY 1 ORDER BY 2 DESC`));

console.log('=== 3. MODERATION: products still sitting in a blocked branch ===');
const blockedIds = cats.filter((c) => blockedDeep(c.id)).map((c) => c.id);
console.log(`  blocked categories: ${blockedIds.length}`);
const stillBlocked = await q(
  `SELECT c.name, count(*)::int FROM "Product" p JOIN "Category" c ON c.id=p."categoryId"
   WHERE p."categoryId" = ANY($1) GROUP BY 1 ORDER BY 2 DESC`, [blockedIds]);
console.table(stillBlocked);
const total = stillBlocked.reduce((a, r) => a + Number(r.count), 0);
console.log(`  -> ${total} products hidden (was 165 for Sex Product before the merge)`);

console.log('\n=== 4. MODERATION: did any formerly-blocked product escape into a visible category? ===');
// The 165 Sex Product ids were captured in the audit CSV; re-derive by name.
const escaped = await q(`
  SELECT p.id, p.name, c.name AS cat FROM "Product" p JOIN "Category" c ON c.id=p."categoryId"
  WHERE p."supplierSource"='EPROLO' AND c.name NOT ILIKE '%sex product%'
    AND (p.name ~* '\\y(sex[- ]?toy|masturbat|vibrator|dildo)\\y')
  LIMIT 10`);
if (escaped.length) {
  console.log(`  !! ${escaped.length} adult-named EPROLO products now sit in a visible category:`);
  for (const e of escaped) console.log(`     #${e.id} (${e.cat}) ${e.name.slice(0, 70)}`);
} else {
  console.log('  none — no adult-named EPROLO product moved into a visible category');
}

console.log('\n=== 5. GRID: root categories, what the browse page renders ===');
const roots = await q(`
  WITH RECURSIVE tree AS (
    SELECT id AS root, id FROM "Category" WHERE "parentId" IS NULL
    UNION ALL SELECT t.root, c.id FROM "Category" c JOIN tree t ON c."parentId"=t.id
  )
  SELECT r.id, r.name, r."thumbnailUrl" IS NOT NULL AS has_thumb,
         COALESCE((SELECT count(*)::int FROM "Product" p JOIN tree t ON t.id=p."categoryId" WHERE t.root=r.id), 0) AS products
  FROM "Category" r WHERE r."parentId" IS NULL ORDER BY products DESC`);
const visibleRoots = roots.filter((r) => !blockedDeep(r.id));
console.log(`  root categories: ${roots.length}`);
console.log(`  with a thumbnail: ${visibleRoots.filter((r) => r.has_thumb).length}/${visibleRoots.length}`);
const stillBoxes = visibleRoots.filter((r) => !r.has_thumb);
console.log(`  STILL SHOWING THE GENERIC BOX: ${stillBoxes.length}`);
for (const r of stillBoxes) console.log(`     ${r.name} [${r.id}] — ${r.products} products`);
const lowDupes = visibleRoots.filter((r) => r.products > 0 && r.products < 25);
console.log(`\n  low-count root tiles (<25 products): ${lowDupes.length}`);
for (const r of lowDupes) console.log(`     ${r.name} — ${r.products}`);

console.log('\n=== 6. the specific tiles from the screenshot ===');
for (const n of ['Bags', 'Cars & Motocycles', 'Consumer Electronic', 'Home Deco', 'Home Set',
                 'Kids & Baby', 'Beauty & Health', 'Jewelry & Accessories', 'Fully Printing  Hat',
                 'Fashion & Clothing']) {
  const r = cats.filter((c) => c.name === n);
  if (!r.length) { console.log(`  "${n}": GONE (merged away)`); continue; }
  for (const c of r) {
    const kids = (await q(`SELECT count(*)::int AS n FROM "Category" WHERE "parentId"=$1`, [c.id]))[0].n;
    console.log(`  "${n}" [${c.id}] kept — parent=${c.parentName ?? 'root'}, thumbnail=${c.thumbnailUrl ? 'yes' : 'NONE'}, children=${kids}`);
  }
}
await pool.end();
