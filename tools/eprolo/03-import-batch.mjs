import 'dotenv/config';
import fs from 'fs';
import sharp from 'sharp';
import pLimit from 'p-limit';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { eproloCall } from './client.mjs';

// EPROLO 20-product pilot batch.
//
// Pipeline, per the agreed spec:
//   eprolo_product_list.html  -> the catalogue feed
//   add_product.html          -> import into our EPROLO account (mints a new id)
//   getproduct.html           -> full detail for the imported id
//   images                    -> download, Sharp -> WebP, upload to S3
//   DB                        -> Product + ProductVariant, supplierSource=EPROLO
//
// Deliberately capped at BATCH_SIZE. Nothing here loops the whole catalogue.

const BATCH_SIZE = 20;
const DRY_RUN = process.argv.includes('--dry-run');

const prisma = new PrismaClient();
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const BUCKET = process.env.S3_BUCKET_NAME;
const REGION = process.env.AWS_REGION;

const slug = (s) =>
  (s || 'uncategorized').toString().trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'uncategorized';

const failures = [];
const imageStats = [];

// ---------------------------------------------------------------- categories
// EPROLO tags products with wareTypeId / wareTypeTwoId, formatted ",19," —
// a comma-wrapped list, not a plain integer.
const parseTypeIds = (v) =>
  String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean).map(Number);

const norm = (s) =>
  (s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

async function buildCategoryIndex() {
  const lvl1 = (await eproloCall('product_type.html')).list;
  const lvl2 = await eproloCall('product_type_two.html');
  const ours = await prisma.category.findMany({ select: { id: true, name: true } });

  const byNorm = new Map();
  for (const c of ours) {
    const k = norm(c.name);
    if (!byNorm.has(k)) byNorm.set(k, []);
    byNorm.get(k).push(c);
  }
  // Only a name that resolves to exactly one of our categories counts as a
  // mapping. Ambiguous and absent names are left unmapped, not guessed at.
  const resolve = (name) => {
    const hits = byNorm.get(norm(name)) || [];
    return hits.length === 1 ? hits[0] : null;
  };

  return {
    lvl1: new Map(lvl1.map((c) => [c.id, c])),
    lvl2: new Map(lvl2.map((c) => [c.id, c])),
    resolve,
  };
}

// -------------------------------------------------------------------- images
async function migrateImage(srcUrl, keyBase) {
  const res = await fetch(srcUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const original = Buffer.from(await res.arrayBuffer());

  const webp = await sharp(original).webp({ quality: 82 }).toBuffer();
  const key = `${keyBase}.webp`;

  if (!DRY_RUN) {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: webp,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    }));
  }

  imageStats.push({
    src: srcUrl,
    key,
    beforeBytes: original.length,
    afterBytes: webp.length,
    savedPct: +(100 - (webp.length / original.length) * 100).toFixed(1),
  });

  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

// ---------------------------------------------------------------------- main
console.log(`EPROLO pilot batch — ${BATCH_SIZE} products${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

const cats = await buildCategoryIndex();
console.log(`Category index: ${cats.lvl1.size} level-1, ${cats.lvl2.size} level-2\n`);

// --- 1. Catalogue feed ---
const feed = await eproloCall('eprolo_product_list.html');
console.log(`[1] eprolo_product_list.html returned ${feed.length} products`);
const batch = feed.slice(0, BATCH_SIZE);
console.log(`    taking ${batch.length}\n`);

// --- 2. Import into our EPROLO account ---
const catalogueIds = batch.map((p) => String(p.id));
const imported = await eproloCall(
  'add_product.html', {}, { method: 'POST', body: { ids: catalogueIds } }
);
console.log(`[2] add_product.html imported ${imported.length}/${catalogueIds.length}`);

// An imported product carries variants_fid on each variant, pointing back at
// the catalogue variant it was copied from — that is the only reliable link
// between the new account id and the catalogue id we asked for.
const fidToCatalogueId = new Map();
for (const p of batch) {
  for (const v of p.variantlist || []) fidToCatalogueId.set(String(v.id), String(p.id));
}
const covered = new Set();
for (const p of imported) {
  for (const v of p.variantlist || []) {
    const cid = fidToCatalogueId.get(String(v.variants_fid));
    if (cid) covered.add(cid);
  }
}
const missing = catalogueIds.filter((c) => !covered.has(c));
if (missing.length) {
  console.log(`    catalogue ids with no imported counterpart: ${missing.join(', ')}`);
  for (const id of missing) failures.push({ stage: 'add_product', id, reason: 'not returned by add_product.html' });
}
const importedIds = imported.map((p) => String(p.id));
console.log();

// --- 3. Full detail ---
console.log('[3] getproduct.html for each imported id');
const details = [];
for (const id of importedIds) {
  try {
    const d = await eproloCall('getproduct.html', { id });
    details.push(Array.isArray(d) ? d[0] : d);
  } catch (e) {
    failures.push({ stage: 'getproduct', id, reason: e.message });
    console.log(`    FAIL ${id}: ${e.message}`);
  }
}
console.log(`    got detail for ${details.length}/${importedIds.length}\n`);

// --- 4 + 5. Images, then DB ---
console.log('[4/5] images -> WebP -> S3, then DB write');
const limit = pLimit(4);
let stored = 0;

for (const p of details) {
  try {
    const l1 = cats.lvl1.get(parseTypeIds(p.wareTypeId)[0]);
    const l2 = cats.lvl2.get(parseTypeIds(p.wareTypeTwoId)[0]);
    const mapped = (l2 && cats.resolve(l2.name)) || (l1 && cats.resolve(l1.name)) || null;
    const keyDir = `products/eprolo/${slug(l1?.name)}/${slug(l2?.name)}/${p.id}`;

    // Gallery in EPROLO's own order. imagefirst is the primary and normally
    // also appears in imagelist, so dedupe rather than uploading it twice.
    const ordered = (p.imagelist || []).slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const srcUrls = [...new Set([p.imagefirst, ...ordered.map((i) => i.src)].filter(Boolean))];

    const uploaded = await Promise.all(
      srcUrls.map((u, i) =>
        limit(async () => {
          try {
            return { src: u, url: await migrateImage(u, `${keyDir}-${i + 1}`) };
          } catch (e) {
            failures.push({ stage: 'image', id: p.id, src: u, reason: e.message });
            return null;
          }
        })
      )
    );
    const ok = uploaded.filter(Boolean);
    const cdnUrls = ok.map((o) => o.url);
    if (!cdnUrls.length) throw new Error('no images migrated successfully');

    // src URL -> migrated URL, so a variant's own image resolves to the CDN
    // copy rather than being guessed at by array position.
    const srcToCdn = new Map(ok.map((o) => [o.src, o.url]));
    const imageIdToCdn = new Map(
      ordered.map((im) => [String(im.id), srcToCdn.get(im.src)]).filter(([, u]) => u)
    );

    const variants = (p.variantlist || []).map((v, i) => ({
      supplierVariantId: String(v.id),
      sku: v.sku ?? null,
      title: v.title ?? null,
      option1: v.option1 ?? null,
      option2: v.option2 ?? null,
      option3: v.option3 ?? null,
      cost: v.cost != null ? String(v.cost) : null,
      weightGrams: v.weight != null ? Math.round(Number(v.weight)) : null,
      inventoryQuantity: v.inventory_quantity ?? null,
      imageUrl: imageIdToCdn.get(String(v.imagesid)) ?? cdnUrls[0],
      position: v.position ?? i,
    }));

    if (DRY_RUN) {
      console.log(`    [dry] ${p.id} — ${cdnUrls.length} imgs, ${variants.length} variants, cat=${mapped?.name ?? 'UNMAPPED'}`);
      stored++;
      continue;
    }

    const data = {
      name: p.title,
      supplierSource: 'EPROLO',
      sku: p.variantlist?.[0]?.sku ?? null,
      imageUrl: cdnUrls[0],
      allImages: cdnUrls,
      description: p.body_html ?? null,
      weightGrams: p.variantlist?.[0]?.weight != null
        ? Math.round(Number(p.variantlist[0].weight))
        : null,
      categoryId: mapped?.id ?? null,
      // Recorded whether mapped or not, so an unmapped product still says what
      // EPROLO filed it under.
      category: [l1?.name, l2?.name].filter(Boolean).join(' > ') || null,
      lastSynced: new Date(),
    };

    const product = await prisma.product.upsert({
      where: { cjPid: String(p.id) },
      create: { cjPid: String(p.id), ...data },
      update: data,
    });

    for (const v of variants) {
      await prisma.productVariant.upsert({
        where: { supplierVariantId: v.supplierVariantId },
        create: { productId: product.id, ...v },
        update: { productId: product.id, ...v },
      });
    }

    stored++;
    console.log(`    OK  ${p.id} -> Product#${product.id}  ${cdnUrls.length} imgs, ${variants.length} variants, cat=${mapped?.name ?? 'UNMAPPED'}`);
  } catch (e) {
    failures.push({ stage: 'store', id: p.id, reason: e.message });
    console.log(`    FAIL ${p.id}: ${e.message}`);
  }
}

// ------------------------------------------------------------------- summary
console.log('\n===== SUMMARY =====');
console.log(`fetched from feed : ${batch.length}`);
console.log(`imported (EPROLO) : ${imported.length}`);
console.log(`detail retrieved  : ${details.length}`);
console.log(`stored in DB      : ${stored}`);
console.log(`failures          : ${failures.length}`);
for (const f of failures) console.log(`  - [${f.stage}] ${f.id}: ${f.reason}`);

console.log(`\nimages migrated: ${imageStats.length}`);
if (imageStats.length) {
  const before = imageStats.reduce((a, b) => a + b.beforeBytes, 0);
  const after = imageStats.reduce((a, b) => a + b.afterBytes, 0);
  console.log(
    `total ${(before / 1048576).toFixed(2)} MB -> ${(after / 1048576).toFixed(2)} MB ` +
    `(${(100 - (after / before) * 100).toFixed(1)}% smaller)`
  );
}

fs.writeFileSync(
  'tools/eprolo/batch-report.json',
  JSON.stringify({ catalogueIds, importedIds, stored, failures, imageStats }, null, 2)
);
console.log('\nreport -> tools/eprolo/batch-report.json');

await prisma.$disconnect();
