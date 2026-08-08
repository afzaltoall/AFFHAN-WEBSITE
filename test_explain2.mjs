import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const query = "bags";
  const like = "%bags%";
  const prefix = "bags%";
  
  const explain = await prisma.$queryRawUnsafe(`
    EXPLAIN ANALYZE
    SELECT "id", "name", "imageUrl", "category"
    FROM "Product"
    WHERE "name" ILIKE '%bags%'
    ORDER BY 
      ("category" ILIKE '%bags%') DESC,
      ("name" ILIKE 'bags%') DESC,
      NULLIF(POSITION('bags' IN lower("name")), 0) ASC NULLS LAST,
      "id" DESC
    LIMIT 6;
  `);

  console.log(explain);
}

main().catch(console.error).finally(() => prisma.$disconnect());
