// Hand-pick a category's picture and stop the assignment script changing it.
//
//   node scripts/lock_category_thumbnail.mjs --list
//   node scripts/lock_category_thumbnail.mjs --id <categoryId> --url <imageUrl>
//   node scripts/lock_category_thumbnail.mjs --id <categoryId>            # lock the current image
//   node scripts/lock_category_thumbnail.mjs --id <categoryId> --unlock
//
// A locked category keeps its image through every run of
// scripts/assign_category_thumbnails.mjs, and that image is reserved so no
// other category can claim it. Intended for the top-level tiles a customer sees
// first; everything below that tier is better left to the automatic rule, which
// guarantees uniqueness across all 668 categories.
import 'dotenv/config';
import pg from 'pg';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : null;
};

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

if (flag('--list') || !argv.length) {
  const rows = await q(
    `SELECT c.id, c.name, c."thumbnailLocked", c."thumbnailUrl",
            (SELECT count(*)::int FROM "Product" p WHERE p."categoryId" = c.id) direct
     FROM "Category" c WHERE c."parentId" IS NULL OR c."thumbnailLocked" ORDER BY c."thumbnailLocked" DESC, c.name`
  );
  console.log('top-level categories and every locked category:\n');
  for (const r of rows) {
    console.log(`${r.thumbnailLocked ? '[LOCKED]' : '[  auto]'} ${r.name}`);
    console.log(`          id  ${r.id}`);
    console.log(`          img ${(r.thumbnailUrl ?? '(none)').split('/').slice(-2).join('/')}`);
  }
  await pool.end();
  process.exit(0);
}

const id = flag('--id');
if (!id || id === true) {
  console.error('need --id <categoryId>. Use --list to see them.');
  await pool.end();
  process.exit(1);
}

const found = await q(`SELECT id, name, "thumbnailUrl", "thumbnailLocked" FROM "Category" WHERE id = $1`, [id]);
if (!found.length) {
  console.error(`no category with id ${id}`);
  await pool.end();
  process.exit(1);
}
const cat = found[0];

if (flag('--unlock')) {
  await q(`UPDATE "Category" SET "thumbnailLocked" = false WHERE id = $1`, [id]);
  console.log(`unlocked ${cat.name} — the next assignment run may change its image.`);
  await pool.end();
  process.exit(0);
}

const url = flag('--url');
if (url && url !== true) {
  // Refuse an image another category already shows: the whole point of the
  // assignment rule is that no two circles look the same.
  const taken = await q(`SELECT id, name FROM "Category" WHERE "thumbnailUrl" = $1 AND id <> $2`, [url, id]);
  if (taken.length) {
    console.error(`that image is already used by "${taken[0].name}" [${taken[0].id}].`);
    console.error('pick another, or reassign that category first.');
    await pool.end();
    process.exit(1);
  }
  await q(`UPDATE "Category" SET "thumbnailUrl" = $1, "thumbnailLocked" = true WHERE id = $2`, [url, id]);
  console.log(`${cat.name}: image set and locked.`);
} else {
  if (!cat.thumbnailUrl) {
    console.error(`${cat.name} has no image to lock. Pass --url <imageUrl>.`);
    await pool.end();
    process.exit(1);
  }
  await q(`UPDATE "Category" SET "thumbnailLocked" = true WHERE id = $1`, [id]);
  console.log(`${cat.name}: current image locked.`);
}
await pool.end();
