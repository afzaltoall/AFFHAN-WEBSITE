import 'dotenv/config';
import pkg from '@prisma/client';
const { PrismaClient, Prisma } = pkg;

// Run the product-sitemap query through Prisma exactly as the route does.
// The built sitemap came out as an empty <urlset>, so the question is whether
// the query returns nothing or the route never reached it.
const prisma = new PrismaClient();

const cats = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
console.log('  categories:', cats.length);

const plain = await prisma.$queryRaw`
  SELECT COUNT(*)::int AS n FROM "Product" p
  WHERE p."supplierSource" = 'EPROLO'
    AND p."description" IS NOT NULL
    AND length(p."description") > 200
`;
console.log('  EPROLO with long description:', plain[0].n);

// Now with the regex parameter, the way Prisma.sql interpolates it.
const { blockedNameRegex, blockedCategoryIdSet } = await import('../../src/lib/moderation.ts').catch(() => ({}));
if (!blockedNameRegex) {
  console.log('  (cannot import the TS moderation module from node; testing the regex shape directly)');
} else {
  const blocked = blockedCategoryIdSet(cats);
  console.log('  blocked categories:', blocked.size);
  const clause = blocked.size ? Prisma.sql`AND p."categoryId" NOT IN (${Prisma.join([...blocked])})` : Prisma.empty;
  const rows = await prisma.$queryRaw(Prisma.sql`
    SELECT COUNT(*)::int AS n FROM "Product" p
    WHERE p."supplierSource" = 'EPROLO'
      AND p."description" IS NOT NULL
      AND length(p."description") > 200
      AND p."name" !~* ${blockedNameRegex()}
      ${clause}
      AND NOT EXISTS (SELECT 1 FROM "ModerationLog" m WHERE m."cjPid" = p."cjPid")
  `);
  console.log('  FINAL count through Prisma:', rows[0].n);
}

await prisma.$disconnect();
