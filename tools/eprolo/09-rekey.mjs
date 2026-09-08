import 'dotenv/config';
import fs from 'fs';
import readline from 'readline';
import { PrismaClient } from '@prisma/client';

// Re-keys the products stored during the add_product era.
//
// Those rows carry EPROLO's ACCOUNT-scoped product id in cjPid (32648112),
// minted by add_product.html. Everything from here on uses the CATALOGUE id the
// feed returns directly (28680739). Left alone, the ingest would insert a second
// row for the same product under its catalogue id.
//
// The two records share a SKU — verified on the pilot product, where catalogue
// and account rows both read EE-A05-0680-01 — so the SKU is the bridge. Title is
// the fallback. Anything matching neither is reported, never guessed at.
//
// Variants are deleted rather than re-keyed: their supplierVariantId is an
// account variant id with no counterpart to map to, and the ingest rebuilds them
// from the feed moments later. Deleting is what stops a product ending up with
// both sets attached.

const DRY_RUN = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

// ---- index the catalogue feed ----
const bySku = new Map();
const byTitle = new Map();
const catalogueIds = new Set();

const rl = readline.createInterface({
  input: fs.createReadStream('tools/eprolo/feed-cache.jsonl'),
  crlfDelay: Infinity,
});
for await (const line of rl) {
  if (!line.trim()) continue;
  const { product: p } = JSON.parse(line);
  const id = String(p.id);
  catalogueIds.add(id);
  const sku = p.variantlist?.[0]?.sku;
  if (sku) {
    if (!bySku.has(sku)) bySku.set(sku, new Set());
    bySku.get(sku).add(id);
  }
  if (p.title) {
    if (!byTitle.has(p.title)) byTitle.set(p.title, new Set());
    byTitle.get(p.title).add(id);
  }
}
console.log(`catalogue cache: ${catalogueIds.size} products, ${bySku.size} distinct SKUs, ${byTitle.size} distinct titles\n`);

// ---- the rows to fix ----
const stored = await prisma.product.findMany({
  where: { supplierSource: 'EPROLO' },
  select: { id: true, cjPid: true, name: true, sku: true },
});
console.log(`EPROLO rows in DB: ${stored.length}`);

const already = stored.filter((p) => catalogueIds.has(p.cjPid));
const toFix = stored.filter((p) => !catalogueIds.has(p.cjPid));
console.log(`  already catalogue-keyed : ${already.length}`);
console.log(`  need re-keying          : ${toFix.length}\n`);

const uniq = (set) => (set && set.size === 1 ? [...set][0] : null);

const plan = [];
const unmatched = [];
for (const p of toFix) {
  const target = (p.sku && uniq(bySku.get(p.sku))) || uniq(byTitle.get(p.name)) || null;
  if (!target) {
    unmatched.push({
      ...p,
      skuHits: p.sku ? bySku.get(p.sku)?.size ?? 0 : 0,
      titleHits: byTitle.get(p.name)?.size ?? 0,
    });
  } else {
    plan.push({ ...p, target, via: p.sku && uniq(bySku.get(p.sku)) ? 'sku' : 'title' });
  }
}

// A catalogue id already occupied by a different row is a genuine duplicate:
// the same product stored twice under its two ids. The account-keyed copy goes.
const targets = plan.map((x) => x.target);
const occupied = new Map(
  (await prisma.product.findMany({
    where: { cjPid: { in: targets } },
    select: { id: true, cjPid: true },
  })).map((r) => [r.cjPid, r.id])
);

const collisions = plan.filter((x) => occupied.has(x.target) && occupied.get(x.target) !== x.id);
const clean = plan.filter((x) => !occupied.has(x.target));

console.log(`matched by SKU   : ${plan.filter((x) => x.via === 'sku').length}`);
console.log(`matched by title : ${plan.filter((x) => x.via === 'title').length}`);
console.log(`unmatched        : ${unmatched.length}`);
console.log(`true duplicates (catalogue row already present) : ${collisions.length}\n`);

for (const u of unmatched.slice(0, 10)) {
  console.log(`  UNMATCHED #${u.id} cjPid=${u.cjPid} sku=${u.sku} skuHits=${u.skuHits} titleHits=${u.titleHits} :: ${u.name?.slice(0, 55)}`);
}

if (DRY_RUN) {
  console.log(`\n[DRY RUN] would re-key ${clean.length}, delete ${collisions.length} duplicates, leave ${unmatched.length} untouched`);
} else {
  let rekeyed = 0, deleted = 0;
  for (const c of clean) {
    await prisma.$transaction([
      prisma.productVariant.deleteMany({ where: { productId: c.id } }),
      prisma.product.update({ where: { id: c.id }, data: { cjPid: c.target } }),
    ]);
    rekeyed++;
  }
  for (const c of collisions) {
    // Cascade takes the variants with it.
    await prisma.product.delete({ where: { id: c.id } });
    deleted++;
  }
  console.log(`\nre-keyed ${rekeyed}, deleted ${deleted} duplicates`);
}

// ---- verify ----
const after = await prisma.product.findMany({
  where: { supplierSource: 'EPROLO' },
  select: { cjPid: true },
});
const stillAccount = after.filter((p) => !catalogueIds.has(p.cjPid));
const dupes = after.length - new Set(after.map((p) => p.cjPid)).size;
console.log(`\nEPROLO rows after : ${after.length}`);
console.log(`  duplicate cjPid : ${dupes}`);
console.log(`  still account-keyed (not in catalogue): ${stillAccount.length}` +
  (stillAccount.length ? ` -> ${stillAccount.slice(0, 5).map((p) => p.cjPid).join(', ')}` : ''));

await prisma.$disconnect();
