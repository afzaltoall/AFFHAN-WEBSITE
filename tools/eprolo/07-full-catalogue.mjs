import 'dotenv/config';
import fs from 'fs';
import sharp from 'sharp';
import pLimit from 'p-limit';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { eproloCall } from './client.mjs';

// Full EPROLO catalogue run: pages 1..649, ~12,980 products and ~90k images
// (sampled across the catalogue at 6.9 variants and 7.0 images per product —
// the variant-heavy pages in the 40s are outliers, not the norm).
//
// Resume-safe. State lives in full-run-state.json, which records every page
// that finished. Re-running skips those, and every DB write is an upsert
// against the supplier's own id, so a page processed twice is a no-op rather
// than a duplicate. A crash costs at most the pages in flight.
//
// Concurrency settings are all measured, not guessed:
//   IMAGE_CONCURRENCY   16 -> 11.5 img/s on real catalogue images
//                             (4 gave 3.9, 8 gave 7.0)
//   PRODUCT_CONCURRENCY  6 -> the one that actually mattered. Processing a
//                             page's products sequentially left the image pool
//                             idle at 1.6 img/s and put the run at ~19h;
//                             overlapping them took it to ~4.9h.
//   PAGE_CONCURRENCY     3 -> overlaps one page's API waits with another's
//                             uploads.
//
// None of these raise the request rate against EPROLO: client.mjs caps that
// independently, serialising writes and allowing a few concurrent reads.

const FIRST_PAGE = Number(process.env.FIRST_PAGE ?? 1);
const LAST_PAGE = Number(process.env.LAST_PAGE ?? 649);
const IMAGE_CONCURRENCY = Number(process.env.IMAGE_CONCURRENCY ?? 16);
const PAGE_CONCURRENCY = Number(process.env.PAGE_CONCURRENCY ?? 3);
const PRODUCT_CONCURRENCY = Number(process.env.PRODUCT_CONCURRENCY ?? 6);
const PROGRESS_EVERY = Number(process.env.PROGRESS_EVERY ?? 50);
const STATE_FILE = 'tools/eprolo/full-run-state.json';

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
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {
      startedAt: new Date().toISOString(),
      pagesDone: [], productsStored: 0, imagesMigrated: 0,
      bytesBefore: 0, bytesAfter: 0,
      categoryOutcome: { leaf: 0, parentFallback: 0, none: 0 },
      failures: [],
    };
  }
}
const state = loadState();
const done = new Set(state.pagesDone);
let saveQueued = false;
function saveState() {
  if (saveQueued) return;
  saveQueued = true;
  setTimeout(() => {
    saveQueued = false;
    state.pagesDone = [...done].sort((a, b) => a - b);
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  }, 250);
}
function saveNow() {
  state.pagesDone = [...done].sort((a, b) => a - b);
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
  const l1id = parseTypeIds(p.wareTypeId)[0];
  const l2id = parseTypeIds(p.wareTypeTwoId)[0];
  const l2 = resolution.level2[l2id];
  const l1 = resolution.level1[l1id];

  // Leaf if EPROLO's level-2 resolves; otherwise fall back to the level-1
  // parent so nothing is stored uncategorised. A product sitting on a
  // level-1 category IS the fallback marker — it is queryable after the fact
  // (categoryId LIKE 'EPROLO-L1-%' or a known level-1 id), which is what makes
  // the manual reassignment pass possible.
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
      try {
        return { src: u, url: await migrateImage(u, `${keyDir}-${i + 1}.webp`) };
      } catch (e) {
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
      inventoryQuantity: v.inventory_quantity ?? null,
      imageUrl: imageIdToCdn.get(String(v.imagesid)) ?? cdnUrls[0],
      position: v.position ?? i,
    };
    await prisma.productVariant.upsert({
      where: { supplierVariantId: String(v.id) },
      create: { productId: product.id, supplierVariantId: String(v.id), ...vd },
      update: { productId: product.id, ...vd },
    });
  }

  state.productsStored++;
}

// ---------------------------------------------------------------- import
// add_product.html rejects some batches with an empty 200 body. The cause is
// undocumented and I could not characterise it exactly: a batch of 20 fails on
// one page and succeeds on another at the same variant count, and a batch that
// fails repeatedly succeeds once its members have been imported individually.
// What is reliable is that single-product imports always work.
//
// So rather than model the rule, halve on failure and recurse to singles. Whole
// batches usually succeed, so the common path stays one call per page, and the
// splitting only costs extra calls on the pages that need it.
async function importAdaptive(ids, page, depth = 0) {
  if (!ids.length) return [];
  try {
    return await eproloCall('add_product.html', {}, {
      method: 'POST', body: { ids }, retries: depth === 0 ? 1 : 0,
    });
  } catch (e) {
    if (ids.length === 1) {
      state.failures.push({ stage: 'add_product', id: ids[0], page, reason: e.message });
      return [];
    }
    const mid = Math.ceil(ids.length / 2);
    const [a, b] = await Promise.all([
      importAdaptive(ids.slice(0, mid), page, depth + 1),
      importAdaptive(ids.slice(mid), page, depth + 1),
    ]);
    return [...a, ...b];
  }
}

// ---------------------------------------------------------------- one page
// Returns 'ok' | 'end' — 'end' is EPROLO's code=-1/"No data" past the last
// page, which is the feed finishing, not a failure.
async function doPage(n) {
  let feed;
  try {
    feed = await eproloCall('eprolo_product_list.html', { page: String(n) });
  } catch (e) {
    if (/No data/i.test(e.message)) return 'end';
    state.failures.push({ stage: 'list', page: n, reason: e.message });
    return 'ok';
  }
  if (!feed.length) return 'end';

  const imported = await importAdaptive(feed.map((p) => String(p.id)), n);
  if (!imported.length) return 'ok';

  // Products within a page run concurrently. Sequentially, only one getproduct
  // was ever in flight and the image pool sat almost idle — measured at 1.6
  // img/s against a benchmarked 11.5. The read lane in client.mjs still caps
  // the actual request rate, so this fills the pipeline rather than raising it.
  const productLimit = pLimit(PRODUCT_CONCURRENCY);
  await Promise.all(imported.map((a) => productLimit(async () => {
    let detail;
    try {
      // getproduct is the authoritative read: add_product returns a stale
      // inventory_quantity (verified — add said 544 where getproduct said a
      // stable 626 across four calls). Everything else matches.
      const d = await eproloCall('getproduct.html', { id: String(a.id) });
      detail = Array.isArray(d) ? d[0] : d;
    } catch (e) {
      state.failures.push({ stage: 'getproduct', id: String(a.id), page: n, reason: e.message });
      return;
    }
    try {
      await storeProduct(detail);
    } catch (e) {
      state.failures.push({ stage: 'store', id: String(a.id), page: n, reason: e.message });
    }
  })));
  return 'ok';
}

// ---------------------------------------------------------------- main
const t0 = Date.now();
const todo = [];
for (let n = FIRST_PAGE; n <= LAST_PAGE; n++) if (!done.has(n)) todo.push(n);

console.log(`EPROLO full catalogue run`);
console.log(`  pages ${FIRST_PAGE}..${LAST_PAGE}, ${todo.length} to do (${done.size} already done)`);
console.log(`  image concurrency ${IMAGE_CONCURRENCY}, page concurrency ${PAGE_CONCURRENCY}, product concurrency ${PRODUCT_CONCURRENCY}`);
console.log(`  progress every ${PROGRESS_EVERY} pages\n`);

let processed = 0;
let ended = false;

const pageLimit = pLimit(PAGE_CONCURRENCY);
await Promise.all(todo.map((n) => pageLimit(async () => {
  if (ended) return;
  const r = await doPage(n);
  if (r === 'end') {
    // Clean end of feed. Do not mark the page done: there was nothing on it.
    ended = true;
    console.log(`[page ${n}] end of feed (code=-1 "No data") — stopping cleanly`);
    return;
  }
  done.add(n);
  processed++;
  saveState();

  if (processed % PROGRESS_EVERY === 0) {
    const mins = (Date.now() - t0) / 60000;
    const rate = processed / mins;
    const left = todo.length - processed;
    console.log(
      `[${new Date().toISOString().slice(11, 19)}] ` +
      `pages ${processed}/${todo.length} | products ${state.productsStored} | ` +
      `images ${state.imagesMigrated} | failures ${state.failures.length} | ` +
      `${rate.toFixed(1)} pages/min | ETA ${(left / rate / 60).toFixed(1)}h`
    );
    saveNow();
  }
})));

saveNow();

const mins = (Date.now() - t0) / 60000;
console.log(`\n===== RUN COMPLETE in ${(mins / 60).toFixed(2)}h =====`);
console.log(`pages processed : ${processed}`);
console.log(`products stored : ${state.productsStored}`);
console.log(`images migrated : ${state.imagesMigrated}`);
if (state.bytesBefore) {
  console.log(`image bytes     : ${(state.bytesBefore / 1073741824).toFixed(2)} GB -> ` +
    `${(state.bytesAfter / 1073741824).toFixed(2)} GB ` +
    `(${(100 - (state.bytesAfter / state.bytesBefore) * 100).toFixed(1)}% smaller)`);
}
console.log(`category: leaf ${state.categoryOutcome.leaf}, ` +
  `parent-fallback ${state.categoryOutcome.parentFallback}, none ${state.categoryOutcome.none}`);
console.log(`failures        : ${state.failures.length}`);

const byStage = {};
for (const f of state.failures) byStage[f.stage] = (byStage[f.stage] ?? 0) + 1;
for (const [k, v] of Object.entries(byStage)) console.log(`   ${k}: ${v}`);

await prisma.$disconnect();
