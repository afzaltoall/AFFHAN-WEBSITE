import 'dotenv/config';
import pg from 'pg';
import { isCategoryBlocked } from './moderation.mjs';

// Gives every thumbnail-less category a real product photo, which is what the
// browse grid falls back from — a category with a null thumbnailUrl renders the
// generic box icon.
//
//   node tools/eprolo/16-category-thumbnails.mjs           # dry run
//   node tools/eprolo/16-category-thumbnails.mjs --apply
//
// The image is taken from a product in the category, preferring one filed
// directly on it and falling back to the nearest populated descendant — a
// parent node holds no products of its own, so without the descendant walk
// every level-1 category would stay blank.
//
// Moderated categories are skipped outright. Pulling a representative photo
// from an adult category is precisely the imagery the block exists to keep off
// the site, and a thumbnail renders in the grid even when the products behind
// it do not.

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

const cats = await q(`SELECT id, name, "parentId", "parentName", "thumbnailUrl" FROM "Category"`);
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

const missing = cats.filter((c) => !c.thumbnailUrl);
console.log(`categories: ${cats.length}, without a thumbnail: ${missing.length}`);
console.log(`  EPROLO-created: ${missing.filter((c) => c.id.startsWith('EPROLO-')).length}`);
console.log(`  CJ            : ${missing.filter((c) => !c.id.startsWith('EPROLO-')).length}\n`);

// Breadth-first over the subtree: the category itself, then its descendants,
// stopping at the first category that actually has a product with an image.
async function pickImage(rootId) {
  const queue = [rootId];
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    if (blockedDeep(id)) continue; // never source imagery from a blocked branch
    const r = await q(
      `SELECT "imageUrl" FROM "Product"
       WHERE "categoryId"=$1 AND "imageUrl" IS NOT NULL AND "imageUrl" <> ''
       ORDER BY id DESC LIMIT 1`, [id]);
    if (r.length) return { url: r[0].imageUrl, from: id };
    for (const kid of children.get(id) ?? []) queue.push(kid);
  }
  return null;
}

let filled = 0, skippedBlocked = 0, noProduct = 0;
const updates = [];
for (const c of missing) {
  if (blockedDeep(c.id)) {
    skippedBlocked++;
    console.log(`  SKIP (moderation-blocked): ${c.name} [${c.id}]`);
    continue;
  }
  const pick = await pickImage(c.id);
  if (!pick) { noProduct++; continue; }
  updates.push({ id: c.id, name: c.name, url: pick.url, from: pick.from });
  filled++;
}

console.log(`\nresolved an image for ${filled}; ${noProduct} have no product anywhere beneath them; ${skippedBlocked} skipped as blocked`);
for (const u of updates.slice(0, 10)) {
  console.log(`  ${u.name} [${u.id}]${u.from !== u.id ? `  (from descendant ${byId.get(u.from)?.name})` : ''}`);
  console.log(`     ${u.url}`);
}
if (updates.length > 10) console.log(`  … and ${updates.length - 10} more`);

if (!APPLY) {
  console.log('\n[DRY RUN] nothing written. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const u of updates) {
    await client.query(`UPDATE "Category" SET "thumbnailUrl"=$1 WHERE id=$2`, [u.url, u.id]);
  }
  await client.query('COMMIT');
  console.log(`\napplied: ${updates.length} thumbnails set`);
} catch (e) {
  await client.query('ROLLBACK');
  console.error('\nROLLED BACK:', e.message);
  process.exitCode = 1;
} finally {
  client.release();
}

const left = await q(`SELECT count(*)::int AS n FROM "Category" WHERE "thumbnailUrl" IS NULL`);
console.log(`categories still without a thumbnail: ${left[0].n}`);
await pool.end();
