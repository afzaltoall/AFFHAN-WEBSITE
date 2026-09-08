import 'dotenv/config';
import pg from 'pg';
import { revalidateCatalogue } from './revalidate.mjs';

// Files the products that came out of the ingest with no category at all.
//
//   node tools/eprolo/18-fix-uncategorised.mjs           # dry run
//   node tools/eprolo/18-fix-uncategorised.mjs --apply
//
// One product qualified: a dog harness-and-leash set whose EPROLO level-2 id
// resolved to nothing. The assignment below is by hand, against a category that
// already exists and already holds the same kind of product — 11 of them — not
// by keyword guess.
//
// Ends by revalidating, so the change is visible immediately rather than after
// the caches expire.

const APPLY = process.argv.includes('--apply');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

// productId -> [categoryId, why]
const ASSIGN = {
  1215343: [
    '2410110353301600600',
    'Pet Collar, Leash & Harness Sets — the product is "Small Dog Harness and ' +
    'Leash Set", and that category is exactly harness+leash sets rather than ' +
    'the separate Pet Harnesses / Pet Leashes leaves beside it',
  ],
};

const before = await q(`SELECT id, "supplierSource", name, "categoryId" FROM "Product" WHERE "categoryId" IS NULL`);
console.log(`products with categoryId NULL: ${before.length}`);
for (const p of before) console.log(`  #${p.id} [${p.supplierSource}] ${p.name.slice(0, 70)}`);

const unplanned = before.filter((p) => !ASSIGN[p.id]);
if (unplanned.length) {
  console.log(`\n${unplanned.length} uncategorised product(s) have no assignment in this script:`);
  for (const p of unplanned) console.log(`  #${p.id} ${p.name.slice(0, 70)}`);
}

console.log('\nplanned assignments:');
for (const [pid, [cid, why]] of Object.entries(ASSIGN)) {
  const prod = await q(`SELECT id, name FROM "Product" WHERE id=$1`, [Number(pid)]);
  const cat = await q(`SELECT id, name, "parentName" FROM "Category" WHERE id=$1`, [cid]);
  if (!prod.length) { console.log(`  #${pid}: product not found — skipping`); continue; }
  if (!cat.length) { console.log(`  #${pid}: TARGET CATEGORY ${cid} NOT FOUND — refusing`); process.exit(1); }
  console.log(`  #${pid} ${prod[0].name.slice(0, 60)}`);
  console.log(`     -> ${cat[0].name} (under ${cat[0].parentName})  [${cid}]`);
  console.log(`     why: ${why}`);
}

if (!APPLY) {
  console.log('\n[DRY RUN] nothing written. Re-run with --apply.');
  await pool.end();
  process.exit(0);
}

let updated = 0;
for (const [pid, [cid]] of Object.entries(ASSIGN)) {
  const cat = (await q(`SELECT name, "parentName" FROM "Category" WHERE id=$1`, [cid]))[0];
  const r = await pool.query(
    `UPDATE "Product" SET "categoryId"=$1, category=$2 WHERE id=$3 AND "categoryId" IS NULL`,
    [cid, [cat.parentName, cat.name].filter(Boolean).join(' > '), Number(pid)]
  );
  updated += r.rowCount;
}
console.log(`\nassigned ${updated} product(s)`);

const after = await q(`SELECT count(*)::int AS n FROM "Product" WHERE "categoryId" IS NULL`);
const bySrc = await q(`SELECT "supplierSource", count(*)::int AS n FROM "Product"
  WHERE "categoryId" IS NULL GROUP BY 1`);
console.log(`products with categoryId NULL now: ${after[0].n}`);
console.log(`  by supplier: ${bySrc.length ? bySrc.map((r) => `${r.supplierSource}=${r.n}`).join(', ') : 'none in either'}`);

await revalidateCatalogue();
await pool.end();
