import 'dotenv/config';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (s, p) => (await pool.query(s, p)).rows;

console.log('=== PRODUCTS ===');
console.table(await q(`SELECT "supplierSource", count(*)::int FROM "Product" GROUP BY 1 ORDER BY 2 DESC`));

console.log('=== VARIANTS (EPROLO products only) ===');
console.table(await q(`SELECT count(*)::int AS variants FROM "ProductVariant" v
  JOIN "Product" p ON p.id=v."productId" WHERE p."supplierSource"='EPROLO'`));

console.log('=== CATEGORY MAPPING ===');
console.table(await q(`
  SELECT CASE
    WHEN "categoryId" IS NULL THEN 'UNMAPPED (null)'
    WHEN "categoryId" LIKE 'EPROLO-L1-%' THEN 'parent-level fallback'
    ELSE 'exact leaf' END AS outcome,
    count(*)::int,
    round(100.0*count(*)/sum(count(*)) OVER (), 3) AS pct
  FROM "Product" WHERE "supplierSource"='EPROLO' GROUP BY 1 ORDER BY 2 DESC`));

console.log('=== IMAGE HOSTING (must be zero supplier hotlinks) ===');
console.table(await q(`
  SELECT CASE
    WHEN "imageUrl" LIKE '%affan-product-images%' THEN 'our S3'
    WHEN "imageUrl" LIKE '%aliyuncs%' THEN 'EPROLO CDN (BAD)'
    WHEN "imageUrl" IS NULL THEN 'null'
    ELSE 'other' END AS host, count(*)::int
  FROM "Product" WHERE "supplierSource"='EPROLO' GROUP BY 1`));

console.log('=== WEBP CHECK ===');
console.table(await q(`SELECT count(*)::int AS not_webp FROM "Product"
  WHERE "supplierSource"='EPROLO' AND "imageUrl" NOT LIKE '%.webp'`));

console.log('=== DATA COMPLETENESS ===');
console.table(await q(`SELECT
  count(*) FILTER (WHERE "weightGrams" IS NOT NULL)::int AS with_weight,
  count(*) FILTER (WHERE description IS NOT NULL)::int AS with_description,
  count(*) FILTER (WHERE sku IS NOT NULL)::int AS with_sku,
  count(*)::int AS total
  FROM "Product" WHERE "supplierSource"='EPROLO'`));

console.log('=== CJ UNTOUCHED ===');
console.table(await q(`SELECT count(*)::int AS cj_products FROM "Product" WHERE "supplierSource"='CJ'`));

console.log('=== TOP EPROLO CATEGORIES ===');
console.table(await q(`SELECT c.name, c."parentName", count(*)::int
  FROM "Product" p JOIN "Category" c ON c.id=p."categoryId"
  WHERE p."supplierSource"='EPROLO' GROUP BY 1,2 ORDER BY 3 DESC LIMIT 8`));

await pool.end();
