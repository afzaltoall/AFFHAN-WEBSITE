import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const query = "bags";
  
  const explain = await prisma.$queryRawUnsafe(`
    EXPLAIN ANALYZE
    SELECT p."id", p."name"
    FROM "Product" p
    LEFT JOIN "Category" c ON p."categoryId" = c."id"
    WHERE (p."name" ~* '\\ybags(s|es)?\\y' OR c."name" ~* '\\ybags(s|es)?\\y')
    ORDER BY 
      (CASE WHEN c."name" ~* '\\ybags(s|es)?\\y' THEN 1 ELSE 0 END) DESC, 
      NULLIF(POSITION('bags' IN lower(p."name")), 0) ASC NULLS LAST, 
      p."id" DESC
    LIMIT 40;
  `);

  console.log(explain);
}

main().catch(console.error).finally(() => prisma.$disconnect());
