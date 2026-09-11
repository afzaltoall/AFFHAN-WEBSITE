// Applies chosen category images and locks them.
//
//   node tools/audit/42-apply-picks.mjs picks.txt           # dry run
//   node tools/audit/42-apply-picks.mjs picks.txt --apply
//
// picks.txt is what the candidate page's "Copy picks" button produces:
//
//   <categoryId> :: <imageUrl>   # Category Name
//
// Locking is the point, not a side effect. scripts/assign_category_thumbnails.mjs
// reassigns every unlocked category from scratch on each run, so a hand-picked
// image that was not locked would survive exactly until the next run.
import fs from 'fs';
import { q, close } from './lib.mjs';

const file = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!file) {
  console.error('usage: 42-apply-picks.mjs <picks.txt> [--apply]');
  process.exit(1);
}

const picks = fs.readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.replace(/\s*#.*$/, '').trim())
  .filter(Boolean)
  .map((l) => {
    const [id, url] = l.split('::').map((s) => s.trim());
    return id && url ? { id, url } : null;
  })
  .filter(Boolean);

console.log(`picks parsed: ${picks.length}`);
if (!picks.length) {
  console.error('nothing to do — expected lines like "<categoryId> :: <imageUrl>"');
  await close();
  process.exit(1);
}

const cats = await q(`SELECT id,name,"thumbnailUrl","thumbnailLocked" FROM "Category"`);
const byId = new Map(cats.map((c) => [c.id, c]));

// An image belongs to exactly one category. Refuse a pick that would break
// that, naming the category holding it, rather than silently creating the
// duplication the assignment rule exists to prevent.
const owner = new Map();
for (const c of cats) if (c.thumbnailUrl) owner.set(c.thumbnailUrl, c);

const ok = [];
let rejected = 0;
for (const p of picks) {
  const cat = byId.get(p.id);
  if (!cat) { console.error(`  !! unknown category ${p.id}`); rejected++; continue; }
  const held = owner.get(p.url);
  if (held && held.id !== p.id) {
    console.error(`  !! "${cat.name}" wants an image already used by "${held.name}" — skipped`);
    rejected++;
    continue;
  }
  ok.push({ ...p, name: cat.name, was: cat.thumbnailUrl, alreadyLocked: cat.thumbnailLocked });
}

console.log(`  applicable : ${ok.length}`);
console.log(`  rejected   : ${rejected}`);
console.log('');
for (const u of ok) {
  const changed = u.was !== u.url;
  console.log(`  ${u.name}`);
  console.log(`      was ${(u.was ?? '(none)').split('/').slice(-2).join('/')}`);
  console.log(`      now ${u.url.split('/').slice(-2).join('/')}${changed ? '' : '   (unchanged, will still be locked)'}`);
}

if (!APPLY) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply.');
  await close();
  process.exit(0);
}

for (const u of ok) {
  await q(`UPDATE "Category" SET "thumbnailUrl" = $1, "thumbnailLocked" = true WHERE id = $2`, [u.url, u.id]);
}
console.log(`\nDone. ${ok.length} categories updated and locked.`);

const dupes = await q(
  `SELECT "thumbnailUrl", count(*)::int c FROM "Category" WHERE "thumbnailUrl" IS NOT NULL GROUP BY 1 HAVING count(*) > 1`
);
console.log(`images shared by more than one category: ${dupes.length} (expect 0)`);
const locked = await q(`SELECT count(*)::int c FROM "Category" WHERE "thumbnailLocked"`);
console.log(`locked categories now: ${locked[0].c}`);
await close();
