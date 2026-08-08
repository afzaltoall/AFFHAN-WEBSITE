import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function addTrigramIndices() {
  try {
    console.log("Enabling pg_trgm extension...");
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    
    console.log("Creating GIN index on Product.name...");
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS product_name_trgm_idx ON "Product" USING GIN (name gin_trgm_ops);`);
    
    console.log("Creating GIN index on Product.description...");
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS product_desc_trgm_idx ON "Product" USING GIN (description gin_trgm_ops);`);
    
    console.log("Running EXPLAIN ANALYZE...");
    const explain = await prisma.$queryRawUnsafe(`
      EXPLAIN ANALYZE
      SELECT * FROM "Product"
      WHERE name ILIKE '%waterproof%' OR description ILIKE '%waterproof%'
    `);
    
    console.log("\nEXPLAIN ANALYZE OUTPUT:");
    console.log(explain.map(row => row['QUERY PLAN']).join('\n'));
    
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

addTrigramIndices();
