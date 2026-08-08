import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const leafCategories = await prisma.$queryRaw`
    SELECT c.id, c.name, COUNT(p.id) as count
    FROM "Category" c
    JOIN "Product" p ON c.id = p."categoryId"
    WHERE c."parentId" IS NOT NULL
    GROUP BY c.id, c.name
    ORDER BY count DESC
    LIMIT 20;
  `;

  console.log("const popularSubcategories = [");
  for (const cat of leafCategories) {
    console.log(`  { id: '${cat.id}', name: '${cat.name.replace(/'/g, "\\'")}', count: ${cat.count} },`);
  }
  console.log("];");
}

main().catch(console.error).finally(() => prisma.$disconnect());
