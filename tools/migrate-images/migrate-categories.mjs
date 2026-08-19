import 'dotenv/config';
import pg from 'pg';
import axios from 'axios';
import pLimit from 'p-limit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const isDryRun = process.argv.includes('--dry-run');

const {
  DATABASE_URL,
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  S3_BUCKET_NAME,
  CONCURRENCY = 5,
} = process.env;

const pool = new pg.Pool({ connectionString: DATABASE_URL });

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

function getExtensionFromUrlOrType(url, contentType) {
  const urlExt = url.split('?')[0].split('.').pop();
  if (urlExt && urlExt.length <= 4 && /^[a-zA-Z0-9]+$/.test(urlExt)) return urlExt.toLowerCase();
  if (contentType && contentType.includes('/')) return contentType.split('/')[1].split(';')[0];
  return 'jpg';
}

async function migrateCategory(cat) {
  try {
    const response = await axios.get(cat.thumbnailUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    const ext = getExtensionFromUrlOrType(cat.thumbnailUrl, contentType);
    const key = `categories/${cat.id}.${ext}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET_NAME,
        Key: key,
        Body: response.data,
        ContentType: contentType,
      })
    );

    const newUrl = `https://${S3_BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${key}`;

    if (isDryRun) {
      console.log(`[DRY-RUN] Would update category ${cat.id} to use URL: ${newUrl}`);
    } else {
      await pool.query('UPDATE "Category" SET "thumbnailUrl" = $1 WHERE id = $2', [newUrl, cat.id]);
      console.log(`[SUCCESS] Updated category ${cat.id} -> ${newUrl}`);
    }
    
    return { id: cat.id, success: true };
  } catch (err) {
    console.error(`[ERROR] Migrating category ${cat.id}:`, err.message);
    return { id: cat.id, success: false };
  }
}

async function run() {
  if (isDryRun) console.log("====== RUNNING IN DRY-RUN MODE ======");
  
  const { rows } = await pool.query(
    `SELECT id, "thumbnailUrl" FROM "Category" WHERE "thumbnailUrl" LIKE '%cjdropshipping.com%'`
  );
  
  console.log(`Found ${rows.length} categories to migrate...`);
  
  const limit = pLimit(Number(CONCURRENCY));
  const results = await Promise.all(rows.map(cat => limit(() => migrateCategory(cat))));
  
  const failed = results.filter(r => !r.success).length;
  console.log(`Done. Success: ${results.length - failed}, Failed: ${failed}`);
  await pool.end();
}

run();
