import 'dotenv/config';
import fs from 'fs';
import pg from 'pg';
import { isCategoryBlocked } from './moderation.mjs';

// Merges the EPROLO categories that duplicate an existing CJ one, deletes the
// empties, and leaves the genuinely distinct ones alone.
//
//   node tools/eprolo/15-category-merge.mjs            # dry run
//   node tools/eprolo/15-category-merge.mjs --apply
//
// The mapping is curated by hand and listed in full below rather than inferred
// at runtime. Name similarity found these, but similarity also proposed
// "Accessories (Pet Supplies)" -> "Accessories (Women's Clothing)" and
// "Bags" -> "Pet Bags", which are wrong. A merge moves products and drops a
// category; it is not something to let a threshold decide.
//
// Two shapes of merge:
//   reparent — an EPROLO level-1 that duplicates a CJ root. Its CHILDREN move
//              under the CJ root, which is how CJ's tree is built (products
//              hang off leaves). Direct products move too.
//   products — an EPROLO leaf that duplicates a CJ leaf. Products move across.
// Both then delete the emptied EPROLO category.

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

const REPARENT = [
  ['EPROLO-L1-13',  'D9E66BF8-4E81-4CAB-A425-AEDEC5FBFBF2', 'Consumer Electronic',   'Consumer Electronics'],
  ['EPROLO-L1-10',  'A2F799BE-FB59-428E-A953-296AA2673FCF', 'Cars & Motocycles',     'Automobiles & Motorcycles'],
  ['EPROLO-L1-19',  '2C7D4A0B-1AB2-41EC-8F9E-13DC31B1C902', 'Beauty & Health',       'Health, Beauty & Hair'],
  ['EPROLO-L1-11',  '2837816E-2FEA-4455-845C-6F40C6D70D1E', 'Jewelry & Accessories', 'Jewelry & Watches'],
  ['EPROLO-L1-127', '2415A90C-5D7B-4CC7-BA8C-C0949F9FF5D8', 'Bags',                  'Bags & Shoes'],
  ['EPROLO-L1-140', '2415A90C-5D7B-4CC7-BA8C-C0949F9FF5D8', 'Shoes & Socks',         'Bags & Shoes'],
  ['EPROLO-L1-150', 'A50A92FA-BCB3-4716-9BD9-BEC629BEE735', 'Kids & Baby',           'Toys, Kids & Babies'],
  ['EPROLO-L1-128', '52FC6CA5-669B-4D0B-B1AC-415675931399', 'Home Deco',             'Home, Garden & Furniture'],
  ['EPROLO-L1-129', '52FC6CA5-669B-4D0B-B1AC-415675931399', 'Home Set',              'Home, Garden & Furniture'],
  ['EPROLO-L1-21',  'A50A92FA-BCB3-4716-9BD9-BEC629BEE735', 'Mother & Kids',         'Toys, Kids & Babies'],
];

const PRODUCTS = [
  ['EPROLO-L2-47',  '95D9F317-1DB3-4E42-A031-02223215B9C5', 'Necklaces & Pendants',     'Necklace & Pendants'],
  ['EPROLO-L2-73',  '79F47CD1-F813-4B4D-8D21-2B35966FBA66', 'Sport Accessories',        'Sports Accessories'],
  ['EPROLO-L2-70',  '937A06CE-ECCC-4C7D-A270-B216DE612AC0', 'Sport Bags',               'Sports Bags'],
  ['EPROLO-L2-148', '1AD00A3C-465A-430A-9820-F2D097FDA53A', 'Home Textile',             'Home Textiles'],
  ['EPROLO-L2-69',  'C20B25A2-348C-48C8-A2C8-FE33749A40DE', 'Fitness & Body Building',  'Fitness & Bodybuilding'],
  ['EPROLO-L2-31',  '912FD088-248B-4D58-84F7-1F10B888CF8A', 'Moblie Phone Accessories', 'Mobile Phone Accessories'],
  ['EPROLO-L2-46',  '4BFAF763-DD09-4DD3-A7E9-E03724D1D51B', 'Home Audio & Video',       'Home Audio & Video'],
  ['EPROLO-L2-119', '85EF081C-819E-448F-BD5C-C5D3F4CFAADA', 'Household Appliances',     'Home Appliances'],
];

// ---------------------------------------------------------------- guards
const cats = await q(`SELECT id, name, "parentId", "parentName" FROM "Category"`);
const byId = new Map(cats.map((c) => [c.id, c]));
const children = new Map();
for (const c of cats) {
  if (!c.parentId) continue;
  if (!children.has(c.parentId)) children.set(c.parentId, []);
  children.get(c.parentId).push(c.id);
}
const blockedDeep = (id, seen = new Set()) => {
  if (seen.has(id)) return false;
  seen.add(id);
  const c = byId.get(id);
  if (!c) return false;
  return isCategoryBlocked(c.name) || (c.parentId ? blockedDeep(c.parentId, seen) : false);
};

// Refuse to move anything out of, or into, a moderated category. A merge that
// re-homed blocked products under a visible parent would quietly undo the
// content block — the one outcome this script must never produce.
const problems = [];
for (const [src, dst, sName, dName] of [...REPARENT, ...PRODUCTS]) {
  if (!byId.has(src)) problems.push(`source missing: ${src} (${sName})`);
  if (!byId.has(dst)) problems.push(`target missing: ${dst} (${dName})`);
  if (byId.has(src) && blockedDeep(src)) problems.push(`SOURCE IS MODERATION-BLOCKED: ${sName} [${src}]`);
  if (byId.has(dst) && blockedDeep(dst)) problems.push(`TARGET IS MODERATION-BLOCKED: ${dName} [${dst}]`);
}
// A blocked child must not ride along into a visible parent unless its own
// name keeps it blocked there.
for (const [src, , sName] of REPARENT) {
  for (const kid of children.get(src) ?? []) {
    const k = byId.get(kid);
    if (blockedDeep(kid) && !isCategoryBlocked(k.name)) {
      problems.push(`child "${k.name}" [${kid}] of ${sName} is blocked only via its parent — reparenting would UNBLOCK it`);
    }
  }
}
if (problems.length) {
  console.log('REFUSING TO RUN:');
  for (const p of problems) console.log(`  - ${p}`);
  await pool.end();
  process.exit(1);
}
console.log('moderation guards passed: no blocked category is a source, a target, or would be unblocked\n');

// ---------------------------------------------------------------- plan
const count = async (id) => (await q(`SELECT count(*)::int AS n FROM "Product" WHERE "categoryId"=$1`, [id]))[0].n;

console.log(`=== REPARENT (${REPARENT.length}) — EPROLO level-1 duplicates of a CJ root ===`);
for (const [src, dst, sName, dName] of REPARENT) {
  const kids = children.get(src) ?? [];
  console.log(`  ${sName} [${src}] -> ${dName}`);
  console.log(`     ${kids.length} child categories move; ${await count(src)} direct products move; then ${sName} is deleted`);
}

console.log(`\n=== MOVE PRODUCTS (${PRODUCTS.length}) — EPROLO leaf duplicates of a CJ leaf ===`);
for (const [src, dst, sName, dName] of PRODUCTS) {
  console.log(`  ${String(await count(src)).padStart(4)} products: ${sName} [${src}] -> ${dName}`);
}

// Empty EPROLO categories, deepest-first so parents empty out before deletion.
const deepCount = (id, seen = new Set()) => {
  if (seen.has(id)) return 0;
  seen.add(id);
  return (countsMap.get(id) ?? 0) + (children.get(id) ?? []).reduce((a, c) => a + deepCount(c, seen), 0);
};
const countsMap = new Map(
  (await q(`SELECT "categoryId", count(*)::int AS n FROM "Product" WHERE "categoryId" IS NOT NULL GROUP BY 1`))
    .map((r) => [r.categoryId, r.n])
);
const mergedAway = new Set([...REPARENT, ...PRODUCTS].map(([s]) => s));
const empties = cats
  .filter((c) => c.id.startsWith('EPROLO-') && !mergedAway.has(c.id) && deepCount(c.id) === 0)
  .map((c) => c.id);

console.log(`\n=== DELETE EMPTY (${empties.length}) — EPROLO categories holding no products at any depth ===`);
for (const id of empties.slice(0, 12)) console.log(`  ${byId.get(id).name} [${id}]`);
if (empties.length > 12) console.log(`  … and ${empties.length - 12} more`);

const keeping = cats.filter(
  (c) => c.id.startsWith('EPROLO-') && !mergedAway.has(c.id) && !empties.includes(c.id)
);
console.log(`\n=== KEEP (${keeping.length}) — distinct, or no CJ equivalent ===`);
for (const c of keeping.sort((a, b) => deepCount(b.id) - deepCount(a.id))) {
  console.log(`  ${String(deepCount(c.id)).padStart(5)}  ${c.name} [${c.id}]${isCategoryBlocked(c.name) ? '  (moderation-blocked)' : ''}`);
}

if (!APPLY) {
  console.log('\n[DRY RUN] nothing changed. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

// ---------------------------------------------------------------- apply
const client = await pool.connect();
let moved = 0, reparented = 0, deleted = 0;
try {
  await client.query('BEGIN');

  for (const [src, dst] of REPARENT) {
    const t = byId.get(dst);
    const r1 = await client.query(
      `UPDATE "Category" SET "parentId"=$1, "parentName"=$2 WHERE "parentId"=$3`,
      [dst, t.name, src]);
    reparented += r1.rowCount;
    const r2 = await client.query(`UPDATE "Product" SET "categoryId"=$1 WHERE "categoryId"=$2`, [dst, src]);
    moved += r2.rowCount;
  }

  for (const [src, dst] of PRODUCTS) {
    const r = await client.query(`UPDATE "Product" SET "categoryId"=$1 WHERE "categoryId"=$2`, [dst, src]);
    moved += r.rowCount;
  }

  // Sources are empty now; delete them plus the pre-existing empties.
  // Deepest-first so a parent is never deleted while a child still points at it.
  const toDelete = [...empties, ...mergedAway];
  const depth = (id) => { let d = 0, c = byId.get(id); while (c?.parentId) { d++; c = byId.get(c.parentId); } return d; };
  for (const id of toDelete.sort((a, b) => depth(b) - depth(a))) {
    const r = await client.query(`DELETE FROM "Category" WHERE id=$1`, [id]);
    deleted += r.rowCount;
  }

  await client.query('COMMIT');
  console.log(`\napplied: ${moved} products moved, ${reparented} categories reparented, ${deleted} categories deleted`);
} catch (e) {
  await client.query('ROLLBACK');
  console.error('\nROLLED BACK — nothing changed:', e.message);
  process.exitCode = 1;
} finally {
  client.release();
}

fs.writeFileSync('tools/eprolo/category-merge-log.json', JSON.stringify(
  { at: new Date().toISOString(), REPARENT, PRODUCTS, empties, kept: keeping.map((c) => [c.id, c.name]) }, null, 2));
console.log('log -> tools/eprolo/category-merge-log.json');
await pool.end();
