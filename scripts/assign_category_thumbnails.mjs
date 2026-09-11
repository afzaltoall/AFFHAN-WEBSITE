// Give every category its own, distinct, representative picture.
//
//   node scripts/assign_category_thumbnails.mjs           # dry run
//   node scripts/assign_category_thumbnails.mjs --apply
//
// ---------------------------------------------------------------------------
// Why this replaces what was there
//
// Three different mechanisms used to assign Category.thumbnailUrl and they
// disagreed:
//
//   1. /api/cron/sync step 5 — write-once, `orderBy: { id: 'desc' }`, so the
//      picture was whichever product happened to be synced last.
//   2. tools/eprolo/16-category-thumbnails.mjs — breadth-first down the
//      subtree, taking the first descendant that had any product image. It
//      visited children in database row order, NOT by size.
//   3. lib/categoryTree.ts finalize() — at render time, falls back to the
//      LARGEST child's image.
//
// (3) is the sensible rule, but it only fires when the stored value is null,
// and (2) had already written one everywhere. So the weakest algorithm's output
// permanently shadowed the strongest one's. That is how "Women's Clothing"
// (89,067 products) came to display the photo of "Suit", a 2-product
// subcategory, and how five parent tiles ended up showing the same picture as
// their own promoted child sitting next to them.
//
// ---------------------------------------------------------------------------
// The rule
//
//   * Deterministic. A leaf takes the LOWEST product id, never the newest, so
//     re-running after a sync does not silently change the picture.
//   * Bottom-up. Leaves claim first, then their parents, then the roots.
//   * Claim-and-exclude. An image belongs to one category. A parent whose best
//     candidate is already taken by a descendant moves to the next candidate,
//     so a parent and its child can never show the same photo.
//   * Idempotent. Every run reassigns from scratch and converges on the same
//     answer, which is what makes drift repairable — unlike the write-once
//     behaviour it replaces.
//   * Locked categories are never touched, and their image counts as claimed
//     so nothing beneath them takes it.
//   * Moderation-blocked categories are skipped entirely, and are never used as
//     a source of imagery. A thumbnail renders in the grid even when the
//     products behind it do not.
// ---------------------------------------------------------------------------
import 'dotenv/config';
import pg from 'pg';
import { isCategoryBlocked } from '../tools/audit/rules.mjs';

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

// How many candidate images to hold per category. A parent only needs a few
// spare when its first choices are claimed; 25 is far more than the deepest
// contention observed (a parent with 14 children).
const CANDIDATES_PER_CATEGORY = 25;

const cats = await q(`SELECT id, name, "parentId", "thumbnailUrl", "thumbnailLocked" FROM "Category"`);
const byId = new Map(cats.map((c) => [c.id, c]));

const blockedDeep = (id, seen = new Set()) => {
  if (seen.has(id)) return false;
  seen.add(id);
  const c = byId.get(id);
  if (!c) return false;
  return isCategoryBlocked(c.name) || (c.parentId ? blockedDeep(c.parentId, seen) : false);
};

const children = new Map();
for (const c of cats) {
  if (!c.parentId || !byId.has(c.parentId)) continue;
  if (!children.has(c.parentId)) children.set(c.parentId, []);
  children.get(c.parentId).push(c.id);
}

const directCount = Object.fromEntries(
  (await q(`SELECT "categoryId" id, count(*)::int c FROM "Product" WHERE "categoryId" IS NOT NULL GROUP BY 1`))
    .map((r) => [r.id, r.c])
);

const subtreeCount = new Map();
const computeSubtree = (id, seen = new Set()) => {
  if (subtreeCount.has(id)) return subtreeCount.get(id);
  if (seen.has(id)) return 0;
  seen.add(id);
  const total = (directCount[id] || 0) + (children.get(id) ?? []).reduce((s, k) => s + computeSubtree(k, seen), 0);
  subtreeCount.set(id, total);
  return total;
};
for (const c of cats) computeSubtree(c.id);

// Candidate images per category, lowest product id first.
console.log('loading candidate images…');
const candidates = new Map();
for (const row of await q(
  `SELECT "categoryId", "imageUrl" FROM (
     SELECT "categoryId", "imageUrl",
            ROW_NUMBER() OVER (PARTITION BY "categoryId" ORDER BY id ASC) rn
     FROM "Product"
     WHERE "categoryId" IS NOT NULL AND "imageUrl" IS NOT NULL AND "imageUrl" <> ''
   ) t WHERE rn <= ${CANDIDATES_PER_CATEGORY}`
)) {
  if (!candidates.has(row.categoryId)) candidates.set(row.categoryId, []);
  candidates.get(row.categoryId).push(row.imageUrl);
}
console.log(`  ${candidates.size} categories have at least one product image`);

// Every image already spoken for. Locked categories reserve theirs up front.
const claimed = new Set();
const locked = cats.filter((c) => c.thumbnailLocked && c.thumbnailUrl);
for (const c of locked) claimed.add(c.thumbnailUrl);
console.log(`  ${locked.length} categories are locked (their images are reserved)`);

/// Candidates for a category, itself first, then descendants biggest-subtree
/// first — so a parent's picture comes from the branch that actually
/// represents it.
function candidatePool(id) {
  const pool = [];
  const visit = (nid, seen = new Set()) => {
    if (seen.has(nid) || blockedDeep(nid)) return;
    seen.add(nid);
    for (const url of candidates.get(nid) ?? []) pool.push(url);
    const kids = [...(children.get(nid) ?? [])].sort((a, b) => (subtreeCount.get(b) ?? 0) - (subtreeCount.get(a) ?? 0));
    for (const k of kids) visit(k, seen);
  };
  visit(id);
  return pool;
}

// Bottom-up: deepest categories first, so leaves claim before their parents.
const depthOf = (c) => {
  let d = 1, cur = c, guard = 0;
  while (cur.parentId && byId.has(cur.parentId) && guard++ < 20) { cur = byId.get(cur.parentId); d++; }
  return d;
};
const ordered = cats
  .filter((c) => !blockedDeep(c.id) && !c.thumbnailLocked && (subtreeCount.get(c.id) ?? 0) > 0)
  .sort((a, b) => depthOf(b) - depthOf(a) || (subtreeCount.get(a) ?? 0) - (subtreeCount.get(b) ?? 0));

const updates = [];
let unchanged = 0, exhausted = 0;
for (const c of ordered) {
  const pool = candidatePool(c.id);
  const pick = pool.find((u) => !claimed.has(u));
  if (!pick) {
    exhausted++;
    console.warn(`  ! no unclaimed image for ${c.name} [${c.id}] (${pool.length} candidates, all taken)`);
    continue;
  }
  claimed.add(pick);
  if (pick === c.thumbnailUrl) unchanged++;
  else updates.push({ id: c.id, name: c.name, from: c.thumbnailUrl, to: pick, size: subtreeCount.get(c.id) ?? 0 });
}

console.log(`\ncategories considered : ${ordered.length}`);
console.log(`  already correct     : ${unchanged}`);
console.log(`  to change           : ${updates.length}`);
console.log(`  no image available  : ${exhausted}`);
console.log(`  locked, untouched   : ${locked.length}`);

const distinct = new Set(claimed).size;
console.log(`\ndistinct images claimed: ${distinct} (must equal categories with an image)`);

console.log('\nlargest categories changing:');
for (const u of [...updates].sort((a, b) => b.size - a.size).slice(0, 12)) {
  console.log(`  ${u.name} (${u.size.toLocaleString()})`);
  console.log(`      from ${(u.from ?? '(none)').split('/').slice(-2).join('/')}`);
  console.log(`      to   ${u.to.split('/').slice(-2).join('/')}`);
}

if (!APPLY) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

const BATCH = 200;
for (let i = 0; i < updates.length; i += BATCH) {
  const slice = updates.slice(i, i + BATCH);
  await q(
    `UPDATE "Category" AS c SET "thumbnailUrl" = v.url
     FROM (SELECT unnest($1::text[]) AS id, unnest($2::text[]) AS url) AS v
     WHERE c.id = v.id`,
    [slice.map((u) => u.id), slice.map((u) => u.to)]
  );
  process.stdout.write(`  updated ${Math.min(i + BATCH, updates.length)}/${updates.length}\r`);
}
console.log(`\nDone. ${updates.length} categories reassigned.`);
await pool.end();
