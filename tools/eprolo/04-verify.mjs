import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const count = await prisma.product.count({ where: { supplierSource: 'EPROLO' } });
const vcount = await prisma.productVariant.count();
console.log(`EPROLO products in DB: ${count}`);
console.log(`ProductVariant rows  : ${vcount}`);

const cjTouched = await prisma.product.count({ where: { supplierSource: 'CJ' } });
console.log(`CJ products (unchanged): ${cjTouched}`);

const hotlinks = await prisma.product.count({
  // Only the supplier's own host counts. Do NOT also match 'eprolo' here —
  // our own S3 keys live under products/eprolo/, so that matches everything.
  where: { supplierSource: 'EPROLO', imageUrl: { contains: 'aliyuncs' } },
});
console.log(`EPROLO rows still pointing at a supplier image host: ${hotlinks}`);

const mapped = await prisma.product.groupBy({
  by: ['category'], where: { supplierSource: 'EPROLO' }, _count: true,
});
console.log('\nEPROLO products by their EPROLO category path:');
for (const m of mapped) console.log(`  ${m._count}x  ${m.category}`);

const withCat = await prisma.product.count({ where: { supplierSource: 'EPROLO', categoryId: { not: null } } });
console.log(`\nlinked to one of our categories: ${withCat}/${count}  (rest deliberately null)`);

await prisma.$disconnect();
