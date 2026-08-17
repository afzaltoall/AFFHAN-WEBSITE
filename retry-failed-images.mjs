import 'dotenv/config';
import pg from 'pg';
import axios from 'axios';
import pLimit from 'p-limit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

const {
  DATABASE_URL,
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  S3_BUCKET_NAME,
  CONCURRENCY = 5, // lower than original — alicdn/CJ rate-limit aggressively on retry
} = process.env;

const pool = new pg.Pool({ connectionString: DATABASE_URL });

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

const INPUT_LOG = './failed-log.csv';
const STILL_FAILED_LOG = './failed-log-round2.csv';
const SKIPPED_VIDEO_LOG = './skipped-video-proxy.csv';

if (!fs.existsSync(STILL_FAILED_LOG)) {
  fs.writeFileSync(STILL_FAILED_LOG, 'id,sku,imageUrl,error\n');
}
if (!fs.existsSync(SKIPPED_VIDEO_LOG)) {
  fs.writeFileSync(SKIPPED_VIDEO_LOG, 'id,sku,imageUrl,reason\n');
}

function slugify(str) {
  if (!str) return 'uncategorized';
  return str
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function getExtensionFromUrlOrType(url, contentType) {
  const urlExt = url.split('?')[0].split('.').pop();
  if (urlExt && urlExt.length <= 4 && /^[a-zA-Z0-9]+$/.test(urlExt)) {
    return urlExt.toLowerCase();
  }
  if (contentType && contentType.includes('/')) {
    return contentType.split('/')[1].split(';')[0];
  }
  return 'jpg';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Different CDNs need different headers to bypass hotlink protection.
// We try a few header variants in order until one works.
function getHeaderVariants(url) {
  if (url.includes('alicdn.com')) {
    return [
      { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', Referer: 'https://www.cjdropshipping.com/' },
      { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', Referer: 'https://www.1688.com/' },
      { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }, // no referer at all
    ];
  }
  // cjdropshipping's own CDN — usually just needs a normal browser UA, retry handles rate-limits
  return [
    { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
  ];
}

async function fetchWithRetry(url, maxAttempts = 3) {
  const variants = getHeaderVariants(url);
  let lastErr;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const headers = variants[Math.min(attempt, variants.length - 1)];
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 20000,
        headers,
      });
      return response;
    } catch (err) {
      lastErr = err;
      const backoff = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
      await sleep(backoff);
    }
  }
  throw lastErr;
}

async function migrateRow(row) {
  const { id, sku, leaf_category, sub_category, root_category, imageUrl } = row;
  // NOTE: `id` here is the real Product.id (looked up via sku), safe to use for the UPDATE.

  // Skip video-proxy urls entirely — they are not images
  if (imageUrl.includes('qksource.com') || imageUrl.includes('image-proxy')) {
    fs.appendFileSync(
      SKIPPED_VIDEO_LOG,
      `${id},${sku || ''},${imageUrl},video-proxy-not-image\n`
    );
    return { id, success: false, skipped: true };
  }

  try {
    const response = await fetchWithRetry(imageUrl, 3);

    const contentType = response.headers['content-type'] || 'image/jpeg';
    const ext = getExtensionFromUrlOrType(imageUrl, contentType);
    const folderPath = [root_category, sub_category, leaf_category]
      .map((c) => slugify(c))
      .join('/');
    const key = `products/${folderPath}/${slugify(sku || String(id))}.${ext}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
        Body: response.data,
        ContentType: contentType,
      })
    );

    const newUrl = `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;

    await pool.query('UPDATE "Product" SET "imageUrl" = $1 WHERE id = $2', [
      newUrl,
      id,
    ]);

    return { id, success: true };
  } catch (err) {
    const msg = (err.message || 'unknown error').replace(/,/g, ';');
    fs.appendFileSync(
      STILL_FAILED_LOG,
      `${id},${sku || ''},${imageUrl},${msg}\n`
    );
    return { id, success: false, error: msg };
  }
}

async function run() {
  console.log('Reading failed-log.csv...');
  const fileContent = fs.readFileSync(INPUT_LOG, 'utf-8');
  const records = parse(fileContent, {
    // First column is actually cjPid (CJ's product id), NOT Product.id — confirmed via DB check.
    // We match rows back to Product using `sku`, which is unique and reliable.
    columns: ['cjPid', 'sku', 'imageUrl', 'error'],
    skip_empty_lines: true,
    relax_column_count: true,
  });

  // Dedupe by sku, skip header row if present
  const seen = new Set();
  const skus = [];
  for (const r of records) {
    if (r.sku === 'sku' || !r.sku) continue; // header row or blank
    if (!seen.has(r.sku)) {
      seen.add(r.sku);
      skus.push(r.sku);
    }
  }

  console.log(`Found ${skus.length} unique failed product skus to retry.`);

  const limit = pLimit(Number(CONCURRENCY));
  let totalSuccess = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  const CHUNK = 200;

  const totalChunks = Math.ceil(skus.length / CHUNK);
  for (let i = 0; i < skus.length; i += CHUNK) {
    const skuChunk = skus.slice(i, i + CHUNK);

    const { rows } = await pool.query(
      `SELECT
         p.id,
         p.sku,
         p.category AS leaf_category,
         c1."parentName" AS sub_category,
         c2."parentName" AS root_category,
         p."imageUrl"
       FROM "Product" p
       LEFT JOIN "Category" c1 ON c1.name = p.category
       LEFT JOIN "Category" c2 ON c2.name = c1."parentName"
       WHERE p.sku = ANY($1::text[])
         AND p."imageUrl" IS NOT NULL
         AND p."imageUrl" NOT LIKE '%' || $2 || '%'`,
      [skuChunk, S3_BUCKET_NAME]
    );

    if (rows.length === 0) continue;

    console.log(`Retrying chunk ${i / CHUNK + 1}/${totalChunks}: ${rows.length} rows...`);

    const results = await Promise.all(
      rows.map((row) => limit(() => migrateRow(row)))
    );

    const success = results.filter((r) => r.success).length;
    const skipped = results.filter((r) => r.skipped).length;
    const failed = results.length - success - skipped;

    totalSuccess += success;
    totalFailed += failed;
    totalSkipped += skipped;

    console.log(
      `Chunk done. Success: ${success}, Failed: ${failed}, Skipped(video): ${skipped}`
    );
    console.log(
      `Running total -> Success: ${totalSuccess}, Failed: ${totalFailed}, Skipped: ${totalSkipped}`
    );
  }

  console.log('\nRetry finished.');
  console.log(`Total recovered: ${totalSuccess}`);
  console.log(`Total still failed (see failed-log-round2.csv): ${totalFailed}`);
  console.log(`Total skipped video-proxy urls (see skipped-video-proxy.csv): ${totalSkipped}`);

  await pool.end();
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
