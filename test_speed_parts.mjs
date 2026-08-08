import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function test() {
  console.log("Connecting...");
  await prisma.$connect();
  
  let start = Date.now();
  console.log("Running count()...");
  const count = await prisma.product.count();
  console.log("Count took:", Date.now() - start, "ms. Result:", count);

  start = Date.now();
  console.log("Running fetch categories...");
  const PREFERRED_TOP_NAMES = [
    "Automobiles & Motorcycles",
    "Pet Supplies",
    "Home, Garden & Furniture",
    "Computer & Office",
    "Phones & Accessories",
  ];
  const allCategories = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
  
  const childrenMap = new Map();
  for (const c of allCategories) {
    if (c.parentId) {
      if (!childrenMap.has(c.parentId)) childrenMap.set(c.parentId, []);
      childrenMap.get(c.parentId).push(c.id);
    }
  }
  const preferredTopIds = allCategories
    .filter(c => !c.parentId && PREFERRED_TOP_NAMES.includes(c.name))
    .map(c => c.id);
  const sourceCatSet = new Set();
  const queue = [...preferredTopIds];
  while (queue.length > 0) {
    const curr = queue.shift();
    sourceCatSet.add(curr);
    for (const child of childrenMap.get(curr) ?? []) queue.push(child);
  }
  const sourceCatIds = Array.from(sourceCatSet);
  console.log("Category processing took:", Date.now() - start, "ms.");

  start = Date.now();
  console.log("Running raw query window...");
  const rows = await prisma.$queryRawUnsafe(`
    SELECT "id", "name", "imageUrl", "category", "categoryId" FROM (
      SELECT "id", "name", "imageUrl", "category", "categoryId",
        ROW_NUMBER() OVER (PARTITION BY "categoryId" ORDER BY "id" DESC) as rn
      FROM "Product"
      WHERE "categoryId" IN (${sourceCatIds.map(id => `'${id}'`).join(',')})
    ) ranked
    WHERE rn <= 3
    ORDER BY rn ASC, "categoryId" ASC
    LIMIT 24
  `);
  console.log("Raw query took:", Date.now() - start, "ms.");

  prisma.$disconnect();
}
test();
