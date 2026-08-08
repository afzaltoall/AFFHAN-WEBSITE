import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const explain = await prisma.$queryRawUnsafe(`
    EXPLAIN ANALYZE
    SELECT p."id", p."name"
    FROM "Product" p
    WHERE 
      (p."name" ILIKE '%bag%' OR p."categoryId" IN (
        SELECT id FROM "Category" WHERE name ILIKE '%bag%'
      ))
      AND (p."name" ~* '\\ybag(s|es)?\\y' OR p."categoryId" IN (
        SELECT id FROM "Category" WHERE name ~* '\\ybag(s|es)?\\y'
      ))
    ORDER BY 
      (CASE WHEN p."name" ~* '\\ybag(s|es)?\\y' THEN 1 ELSE 0 END) DESC, 
      NULLIF(POSITION('bag' IN lower(p."name")), 0) ASC NULLS LAST, 
      p."id" DESC
    LIMIT 40;
  `);

  console.log(explain);
}

main().catch(console.error).finally(() => prisma.$disconnect());
