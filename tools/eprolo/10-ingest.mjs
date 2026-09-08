import 'dotenv/config';
import fs from 'fs';
import readline from 'readline';
import sharp from 'sharp';
import pLimit from 'p-limit';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Ingests the cached catalogue feed: images to S3 as WebP, then Product and
// ProductVariant rows. Makes no EPROLO API calls at all — 08-crawl-feed.mjs
// already fetched everything, so nothing here touches the 500-product import
// quota that stopped the previous approach.
//
// Resume-safe by product rather than by page: state records every catalogue id
// finished, so an interruption costs only the products in flight, and a re-run
// skips the rest. Every write is an upsert keyed on the supplier's id, so
// processing one twice updates rather than duplicates.

const CACHE = 'tools/eprolo/feed-cache.jsonl';
const STATE_FILE = 'tools/eprolo/ingest-state.json';
const IMAGE_CONCURRENCY = Number(process.env.IMAGE_CONCURRENCY ?? 16);
const PRODUCT_CONCURRENCY = Number(process.env.PRODUCT_CONCURRENCY ?? 8);
const PROGRESS_EVERY_PAGES = Number(process.env.PROGRESS_EVERY_PAGES ?? 50);

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

const resolution = JSON.parse(fs.readFileSync('tools/eprolo/category-resolution.json', 'utf8'));

const slug = (s) =>
  (s || 'uncategorized').toString().trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'uncategorized';
const parseTypeIds = (v) =>
  String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean).map(Number);

// ---------------------------------------------------------------- state
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch {
    return {
      startedAt: new Date().toISOString(),
      doneIds: [], productsStored: 0, variantsStored: 0, imagesMigrated: 0,
      bytesBefore: 0, bytesAfter: 0,
      categoryOutcome: { leaf: 0, parentFallback: 0, none: 0 },
      failures: [],
    };
  }
}
const state = loadState();
const done = new Set(state.doneIds);
function saveNow() {
  state.doneIds = [...done];
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---------------------------------------------------------------- images
const imageLimit = pLimit(IMAGE_CONCURRENCY);

async function migrateImage(srcUrl, key) {
  const res = await fetch(srcUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`download HTTP ${res.status}`);
  const original = Buffer.from(await res.arrayBuffer());
  const webp = await sharp(original).webp({ quality: 82 }).toBuffer();

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: webp, ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable',
  }));

  state.imagesMigrated++;
  state.bytesBefore += original.length;
  state.bytesAfter += webp.length;
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

// ---------------------------------------------------------------- one product
async function storeProduct(p) {
  const l1 = resolution.level1[parseTypeIds(p.wareTypeId)[0]];
  const l2 = resolution.level2[parseTypeIds(p.wareTypeTwoId)[0]];

  // Leaf where EPROLO's level-2 resolves, else the level-1 parent, so nothing
  // is stored uncategorised. A product sitting on a level-1 category is itself
  // the fallback marker — queryable later for the manual reassignment pass.
  const target = l2 ?? l1 ?? null;
  if (l2) state.categoryOutcome.leaf++;
  else if (l1) state.categoryOutcome.parentFallback++;
  else state.categoryOutcome.none++;

  const keyDir = `products/eprolo/${slug(l1?.name)}/${slug(l2?.name)}/${p.id}`;

  const ordered = (p.imagelist || []).slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const srcUrls = [...new Set([p.imagefirst, ...ordered.map((i) => i.src)].filter(Boolean))];

  const uploaded = await Promise.all(srcUrls.map((u, i) =>
    imageLimit(async () => {
      try { return { src: u, url: await migrateImage(u, `${keyDir}-${i + 1}.webp`) }; }
      catch (e) {
        state.failures.push({ stage: 'image', id: String(p.id), src: u, reason: e.message });
        return null;
      }
    })
  ));
  const ok = uploaded.filter(Boolean);
  const cdnUrls = ok.map((o) => o.url);
  if (!cdnUrls.length) throw new Error('no images migrated');

  const srcToCdn = new Map(ok.map((o) => [o.src, o.url]));
  const imageIdToCdn = new Map(
    ordered.map((im) => [String(im.id), srcToCdn.get(im.src)]).filter(([, u]) => u)
  );

  const data = {
    name: p.title,
    supplierSource: 'EPROLO',
    sku: p.variantlist?.[0]?.sku ?? null,
    imageUrl: cdnUrls[0],
    allImages: cdnUrls,
    description: p.body_html ?? null,
    weightGrams: p.variantlist?.[0]?.weight != null
      ? Math.round(Number(p.variantlist[0].weight)) : null,
    categoryId: target?.id ?? null,
    category: [l1?.name, l2?.name].filter(Boolean).join(' > ') || null,
    lastSynced: new Date(),
  };

  const product = await prisma.product.upsert({
    where: { cjPid: String(p.id) },
    create: { cjPid: String(p.id), ...data },
    update: data,
  });

  for (const [i, v] of (p.variantlist || []).entries()) {
    const vd = {
      sku: v.sku ?? null,
      title: v.title ?? null,
      option1: v.option1 ?? null,
      option2: v.option2 ?? null,
      option3: v.option3 ?? null,
      cost: v.cost != null ? String(v.cost) : null,
      weightGrams: v.weight != null ? Math.round(Number(v.weight)) : null,
      // From the list feed now, not from a post-import read. Accepted: stock is
      // never shown anywhere in this UI.
      inventoryQuantity: v.inventory_quantity ?? null,
      imageUrl: imageIdToCdn.get(String(v.imagesid)) ?? cdnUrls[0],
      position: v.position ?? i,
    };
    await prisma.productVariant.upsert({
      where: { supplierVariantId: String(v.id) },
      create: { productId: product.id, supplierVariantId: String(v.id), ...vd },
      update: { productId: product.id, ...vd },
    });
    state.variantsStored++;
  }

  state.productsStored++;
}

// ---------------------------------------------------------------- main
const t0 = Date.now();
const rl = readline.createInterface({
  input: fs.createReadStream(CACHE),
  crlfDelay: Infinity,
});

let total = 0, skipped = 0, lastPage = 0, processed = 0;
const limit = pLimit(PRODUCT_CONCURRENCY);
const inFlight = [];

console.log(`EPROLO ingest from ${CACHE}`);
console.log(`  image concurrency ${IMAGE_CONCURRENCY}, product concurrency ${PRODUCT_CONCURRENCY}`);
console.log(`  ${done.size} products already done\n`);

function report(page) {
  const mins = (Date.now() - t0) / 60000;
  const rate = processed / mins;
  console.log(
    `[${new Date().toISOString().slice(11, 19)}] page ${page} | ` +
    `products ${state.productsStored} | variants ${state.variantsStored} | ` +
    `images ${state.imagesMigrated} | failures ${state.failures.length} | ` +
    `${rate.toFixed(0)} products/min`
  );
  saveNow();
}

for await (const line of rl) {
  if (!line.trim()) continue;
  const { page, product } = JSON.parse(line);
  total++;
  if (done.has(String(product.id))) { skipped++; continue; }

  if (page !== lastPage) {
    if (lastPage && lastPage % PROGRESS_EVERY_PAGES === 0) {
      await Promise.all(inFlight.splice(0));
      report(lastPage);
    }
    lastPage = page;
  }

  inFlight.push(limit(async () => {
    try {
      await storeProduct(product);
      done.add(String(product.id));
      processed++;
    } catch (e) {
      state.failures.push({ stage: 'store', id: String(product.id), page, reason: e.message });
    }
  }));

  // Keep the pending array from growing to the size of the whole catalogue.
  if (inFlight.length >= 200) await Promise.all(inFlight.splice(0));
}

await Promise.all(inFlight);
saveNow();

const mins = (Date.now() - t0) / 60000;
console.log(`\n===== INGEST COMPLETE in ${(mins / 60).toFixed(2)}h =====`);
console.log(`cache products   : ${total}`);
console.log(`skipped (done)   : ${skipped}`);
console.log(`products stored  : ${state.productsStored}`);
console.log(`variants stored  : ${state.variantsStored}`);
console.log(`images migrated  : ${state.imagesMigrated}`);
if (state.bytesBefore) {
  console.log(`image bytes      : ${(state.bytesBefore / 1073741824).toFixed(2)} GB -> ` +
    `${(state.bytesAfter / 1073741824).toFixed(2)} GB ` +
    `(${(100 - (state.bytesAfter / state.bytesBefore) * 100).toFixed(1)}% smaller)`);
}
const co = state.categoryOutcome;
const cTotal = co.leaf + co.parentFallback + co.none;
console.log(`category: leaf ${co.leaf}, parent-fallback ${co.parentFallback}, none ${co.none}` +
  (cTotal ? `  (unmapped ${((co.none / cTotal) * 100).toFixed(2)}%)` : ''));
console.log(`failures         : ${state.failures.length}`);
const byStage = {};
for (const f of state.failures) byStage[f.stage] = (byStage[f.stage] ?? 0) + 1;
for (const [k, v] of Object.entries(byStage)) console.log(`   ${k}: ${v}`);

await prisma.$disconnect();
