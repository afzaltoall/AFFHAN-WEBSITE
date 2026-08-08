import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  const allCategories = await prisma.category.findMany();
  
  // Build parent relationships
  const childrenMap = new Map();
  for (const c of allCategories) {
    if (c.parentId) {
      if (!childrenMap.has(c.parentId)) childrenMap.set(c.parentId, []);
      childrenMap.get(c.parentId).push(c.id);
    }
  }

  // Find descendants for a category
  function getDescendants(targetId) {
    const ids = [];
    const queue = [targetId];
    while (queue.length > 0) {
      const curr = queue.shift();
      ids.push(curr);
      if (childrenMap.has(curr)) {
        queue.push(...childrenMap.get(curr));
      }
    }
    return ids;
  }

  // Get product counts per LEAF category
  const leafCountsRaw = await prisma.category.findMany({
    select: { id: true, _count: { select: { products: true } } }
  });
  
  const leafCounts = new Map(leafCountsRaw.map(c => [c.id, c._count.products]));

  // Calculate totals for all top-level categories
  const topLevels = allCategories.filter(c => !c.parentId);
  const results = [];

  for (const top of topLevels) {
    const descendants = getDescendants(top.id);
    let total = 0;
    for (const d of descendants) {
      total += leafCounts.get(d) || 0;
    }
    results.push({ id: top.id, name: top.name, count: total });
  }

  results.sort((a, b) => b.count - a.count);
  const top15 = results.slice(0, 15);
  
  console.log(top15);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
