import 'dotenv/config';
import pg from 'pg';

// End-to-end CDN/S3 verification for the EPROLO catalogue.
//
// Fetches through the CloudFront domain the browser actually uses, not the raw
// S3 URL stored in the database — those are different hostnames and only one of
// them is what a customer hits.

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

const S3_HOST = 'affan-product-images.s3.ap-south-1.amazonaws.com';
const CDN = (process.env.NEXT_PUBLIC_CDN_URL || '').replace(/\/$/, '');
const toCdn = (u) => (u && CDN && u.includes(S3_HOST)) ? u.replace(`https://${S3_HOST}`, CDN) : u;

console.log(`CloudFront domain: ${CDN || '(NEXT_PUBLIC_CDN_URL unset)'}\n`);

// ---------------------------------------------------------------- 1
console.log('=== CHECK 1: CloudFront delivery, 10 products across categories ===');
const sample = await q(`
  SELECT DISTINCT ON (p."categoryId") p.id, p.name, p."imageUrl", p."allImages", c.name AS cat
  FROM "Product" p JOIN "Category" c ON c.id = p."categoryId"
  WHERE p."supplierSource"='EPROLO' AND p."imageUrl" IS NOT NULL
  ORDER BY p."categoryId", p.id DESC LIMIT 10`);

let c1ok = 0, c1bad = 0, hit = 0, miss = 0, other = 0;
const times = [];
for (const p of sample) {
  const urls = [p.imageUrl, ...(p.allImages || [])].filter(Boolean);
  const uniq = [...new Set(urls)];
  let prodOk = 0, prodBad = 0;
  for (const raw of uniq) {
    const url = toCdn(raw);
    const t0 = Date.now();
    try {
      const r = await fetch(url, { method: 'GET', headers: { range: 'bytes=0-2047' }, signal: AbortSignal.timeout(45000) });
      const ms = Date.now() - t0;
      times.push(ms);
      const ct = r.headers.get('content-type') || '';
      const xc = (r.headers.get('x-cache') || '').toLowerCase();
      if (xc.includes('hit')) hit++; else if (xc.includes('miss')) miss++; else other++;
      if ((r.status === 200 || r.status === 206) && ct.includes('image/webp')) { prodOk++; c1ok++; }
      else { prodBad++; c1bad++; console.log(`    BAD ${r.status} ${ct} ${url.slice(-70)}`); }
    } catch (e) {
      prodBad++; c1bad++; console.log(`    ERR ${e.message} ${url.slice(-70)}`);
    }
  }
  console.log(`  #${p.id} [${p.cat}] ${uniq.length} images -> ${prodOk} ok, ${prodBad} bad`);
}
const avg = times.length ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(0) : 'n/a';
const p95 = times.length ? times.slice().sort((a, b) => a - b)[Math.floor(times.length * 0.95)] : 'n/a';
console.log(`  TOTAL: ${c1ok} ok, ${c1bad} bad | avg ${avg}ms, p95 ${p95}ms`);
console.log(`  CHECK 1: ${c1bad === 0 ? 'PASS' : 'FAIL'}`);

// ---------------------------------------------------------------- 2
console.log('\n=== CHECK 2: missing/empty images in the DB ===');
const missing = await q(`
  SELECT
    count(*) FILTER (WHERE "imageUrl" IS NULL OR btrim("imageUrl")='')::int AS null_imageurl,
    count(*) FILTER (WHERE "allImages" IS NULL)::int                        AS null_allimages,
    count(*) FILTER (WHERE jsonb_array_length("allImages"::jsonb)=0)::int    AS empty_allimages,
    count(*)::int AS total
  FROM "Product" WHERE "supplierSource"='EPROLO'`);
console.table(missing);
const m = missing[0];
const c2 = m.null_imageurl === 0 && m.null_allimages === 0 && m.empty_allimages === 0;
console.log(`  CHECK 2: ${c2 ? 'PASS' : 'FAIL'}`);

// ---------------------------------------------------------------- 3
console.log('\n=== CHECK 3: remaining references to the old products/eprolo/ path ===');
const refs = await q(`
  SELECT
    (SELECT count(*)::int FROM "Product" WHERE "imageUrl" LIKE '%/products/eprolo/%')          AS product_imageurl,
    (SELECT count(*)::int FROM "Product" WHERE "allImages"::text LIKE '%/products/eprolo/%')   AS product_allimages,
    (SELECT count(*)::int FROM "ProductVariant" WHERE "imageUrl" LIKE '%/products/eprolo/%')   AS variant_imageurl,
    (SELECT count(*)::int FROM "Product" WHERE description LIKE '%/products/eprolo/%')         AS descriptions`);
console.table(refs);
const r3 = refs[0];
const totalRefs = r3.product_imageurl + r3.product_allimages + r3.variant_imageurl + r3.descriptions;
console.log(`  total remaining references: ${totalRefs}`);
console.log(`  CHECK 3: ${totalRefs === 0 ? 'PASS (clean)' : 'NOT CLEAN — migration steps 2-4 have not run yet'}`);

// ---------------------------------------------------------------- 4
console.log('\n=== CHECK 4: CloudFront cache HIT/MISS ===');
const totalCache = hit + miss + other;
console.log(`  HIT ${hit}, MISS ${miss}, other/unknown ${other} of ${totalCache}`);
if (totalCache) {
  console.log(`  hit ratio: ${((hit / totalCache) * 100).toFixed(0)}%`);
}
console.log('  (MISS is expected and not an error on a cold or recently-changed path)');

await pool.end();
