import 'dotenv/config';
import pg from 'pg';
import axios from 'axios';
import pLimit from 'p-limit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';

const {
  DATABASE_URL,
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  S3_BUCKET_NAME,
  BATCH_SIZE = 100,
  CONCURRENCY = 10,
} = process.env;

const pool = new pg.Pool({ connectionString: DATABASE_URL });

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

const FAILED_LOG = './failed-log.csv';
if (!fs.existsSync(FAILED_LOG)) {
  fs.writeFileSync(FAILED_LOG, 'id,sku,imageUrl,error\n');
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

async function migrateRow(row) {
  const { id, sku, leaf_category, sub_category, root_category, imageUrl } = row;

  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

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
      FAILED_LOG,
      `${id},${sku || ''},${imageUrl},${msg}\n`
    );
    return { id, success: false, error: msg };
  }
}

async function run() {
  const limit = pLimit(Number(CONCURRENCY));
  let totalDone = 0;
  let totalFailed = 0;
  let batchNumber = 0;

  while (true) {
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
       WHERE p."imageUrl" IS NOT NULL
         AND p."imageUrl" NOT LIKE '%' || $1 || '%'
       ORDER BY p.id ASC
       LIMIT $2`,
      [S3_BUCKET_NAME, Number(BATCH_SIZE)]
    );

    if (rows.length === 0) {
      console.log('No more rows to migrate. Done.');
      break;
    }

    batchNumber += 1;
    console.log(`Batch ${batchNumber}: processing ${rows.length} rows...`);

    const results = await Promise.all(
      rows.map((row) => limit(() => migrateRow(row)))
    );

    const failed = results.filter((r) => !r.success).length;
    totalDone += results.length - failed;
    totalFailed += failed;

    console.log(
      `Batch ${batchNumber} done. Success: ${results.length - failed}, Failed: ${failed}`
    );
    console.log(`Running total -> Success: ${totalDone}, Failed: ${totalFailed}`);
  }

  console.log('Migration finished.');
  console.log(`Total success: ${totalDone}`);
  console.log(`Total failed: ${totalFailed} (see failed-log.csv)`);

  await pool.end();
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
