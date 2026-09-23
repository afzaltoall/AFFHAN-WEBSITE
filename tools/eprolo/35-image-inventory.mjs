import 'dotenv/config';
import pg from 'pg';

// Where do our product images actually live, and in what format?
//
//   node tools/eprolo/35-image-inventory.mjs
//
// Read-only. Scoping the resize work needs three numbers that nothing in the
// repo records: how many images we own versus still hotlink, how many are
// already WebP, and how many distinct files a full pass would have to touch
// (allImages holds the gallery, not just the card thumbnail).

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

const bucketHost = 'd294cbym1d7nev.cloudfront.net';

console.log('=== primary imageUrl by host ===');
for (const r of await q(`
  SELECT
    CASE
      WHEN "imageUrl" IS NULL THEN '(null)'
      WHEN "imageUrl" LIKE '%${bucketHost}%' THEN 'our CloudFront'
      WHEN "imageUrl" LIKE '%amazonaws.com%'  THEN 'our S3 (direct URL)'
      WHEN "imageUrl" LIKE '%cjdropshipping%' THEN 'CJ (hotlinked)'
      WHEN "imageUrl" LIKE '%aliyuncs%'       THEN 'Aliyun (hotlinked)'
      ELSE 'other'
    END AS host,
    count(*)::int AS n
  FROM "Product" GROUP BY 1 ORDER BY n DESC`)) {
  console.log(`  ${r.host.padEnd(22)} ${r.n.toLocaleString().padStart(12)}`);
}

console.log('\n=== primary imageUrl by extension ===');
for (const r of await q(`
  SELECT lower(substring("imageUrl" from '\\.([a-zA-Z0-9]+)$')) AS ext, count(*)::int AS n
  FROM "Product" WHERE "imageUrl" IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 8`)) {
  console.log(`  ${String(r.ext ?? '(none)').padEnd(8)} ${r.n.toLocaleString().padStart(12)}`);
}

console.log('\n=== by supplier source ===');
for (const r of await q(`
  SELECT "supplierSource", count(*)::int AS n,
         count(*) FILTER (WHERE "imageUrl" LIKE '%${bucketHost}%')::int AS on_cdn,
         count(*) FILTER (WHERE "imageUrl" LIKE '%.webp')::int AS webp
  FROM "Product" GROUP BY 1 ORDER BY n DESC`)) {
  console.log(`  ${String(r.supplierSource).padEnd(8)} total ${r.n.toLocaleString().padStart(10)}   on our CDN ${r.on_cdn.toLocaleString().padStart(10)}   webp ${r.webp.toLocaleString().padStart(10)}`);
}

console.log('\n=== gallery size (allImages) ===');
const g = (await q(`
  SELECT count(*)::int AS with_gallery,
         sum(jsonb_array_length("allImages"::jsonb))::bigint AS total_images,
         avg(jsonb_array_length("allImages"::jsonb))::numeric(6,2) AS avg_per_product
  FROM "Product"
  WHERE "allImages" IS NOT NULL AND jsonb_typeof("allImages"::jsonb) = 'array'`))[0];
console.log(`  products with a gallery : ${Number(g.with_gallery).toLocaleString()}`);
console.log(`  images across galleries : ${Number(g.total_images ?? 0).toLocaleString()}  (avg ${g.avg_per_product} per product)`);

const total = (await q(`SELECT count(*)::int n FROM "Product"`))[0].n;
console.log(`\n  products total          : ${total.toLocaleString()}`);

await pool.end();
