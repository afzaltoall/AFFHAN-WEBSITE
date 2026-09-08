import 'dotenv/config';
import fs from 'fs';
import sharp from 'sharp';
import pLimit from 'p-limit';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const CACHE_FILE = 'tools/eprolo/migrate-body-state.json';
const IMAGE_CONCURRENCY = Number(process.env.IMAGE_CONCURRENCY ?? 16);

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

function loadState() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); }
  catch { return { doneIds: [], imagesMigrated: 0, productsUpdated: 0, failures: [] }; }
}
const state = loadState();
const done = new Set(state.doneIds);

function saveNow() {
  state.doneIds = [...done];
  fs.writeFileSync(CACHE_FILE, JSON.stringify(state, null, 2));
}

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
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

async function main() {
  console.log('Fetching EPROLO products with body images...');
  const products = await prisma.product.findMany({
    where: { 
      supplierSource: 'EPROLO',
      description: { contains: '<img' }
    },
    select: { id: true, cjPid: true, description: true }
  });

  console.log(`Found ${products.length} products to check.`);

  let i = 0;
  for (const p of products) {
    i++;
    if (done.has(p.id)) continue;

    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    let newDesc = p.description;
    let match;
    const urlsToMigrate = [];

    while ((match = imgRegex.exec(p.description)) !== null) {
      const url = match[1];
      if (url.includes('eprolo') || url.includes('aliyuncs')) {
         urlsToMigrate.push(url);
      }
    }

    if (urlsToMigrate.length === 0) {
      done.add(p.id);
      if (i % 50 === 0) saveNow();
      continue;
    }

    console.log(`[${i}/${products.length}] Product ${p.id} - migrating ${urlsToMigrate.length} images`);
    
    const uniqueUrls = [...new Set(urlsToMigrate)];
    const urlMap = new Map();

    const uploads = await Promise.all(uniqueUrls.map((u, idx) => 
      imageLimit(async () => {
        try {
          const urlPath = new URL(u).pathname;
          let filename = urlPath.split('/').pop();
          if (!filename || !filename.includes('.')) {
             filename = `img-${idx}.jpg`;
          }
          const cleanName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '');
          const key = `products/eprolo/body/${p.id}-${cleanName}.webp`;
          const s3Url = await migrateImage(u, key);
          return { src: u, s3Url };
        } catch (e) {
          state.failures.push({ productId: p.id, url: u, error: e.message });
          return null;
        }
      })
    ));

    let allSuccess = true;
    for (const res of uploads) {
      if (res) {
         urlMap.set(res.src, res.s3Url);
      } else {
         allSuccess = false;
      }
    }

    for (const [src, s3Url] of urlMap.entries()) {
      newDesc = newDesc.replaceAll(src, s3Url);
    }

    if (newDesc !== p.description) {
      await prisma.product.update({
        where: { id: p.id },
        data: { description: newDesc }
      });
      state.productsUpdated++;
    }

    if (allSuccess) {
       done.add(p.id);
    }
    
    if (i % 50 === 0) {
      saveNow();
    }
  }

  saveNow();
  console.log('\nMigration complete.');
  console.log(`Updated ${state.productsUpdated} products, migrated ${state.imagesMigrated} images.`);
  if (state.failures.length > 0) {
    console.log(`Encountered ${state.failures.length} image failures. Check state file.`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
