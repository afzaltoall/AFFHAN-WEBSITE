import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const r1 = await pool.query('SELECT COUNT(*) FROM "Product"');
console.log('Total products in this DB:', r1.rows[0].count);

const r2 = await pool.query('SELECT id, sku, "imageUrl" FROM "Product" WHERE sku = $1', ['CJWY1919917']);
console.log('Lookup for sku CJWY1919917:', r2.rows);

const r3 = await pool.query('SELECT sku FROM "Product" LIMIT 5');
console.log('Sample skus in this DB:', r3.rows);

await pool.end();
