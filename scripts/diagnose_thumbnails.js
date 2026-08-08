const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const noThumb = await prisma.category.findMany({ 
    where: { OR: [{ thumbnailUrl: null }, { thumbnailUrl: '' }] }, 
    select: { id: true, _count: { select: { products: true } } } 
  });
  
  let zeroProducts = 0;
  let hasProducts = 0;
  let prodNoImg = 0;
  
  for (const cat of noThumb) {
    if (cat._count.products === 0) {
      zeroProducts++;
    } else {
      hasProducts++;
      const prod = await prisma.product.findFirst({ 
        where: { categoryId: cat.id, imageUrl: { not: null, not: '' } } 
      });
      if (!prod) prodNoImg++;
    }
  }
  
  console.log('\n--- DIAGNOSIS ---');
  console.log(`Total Null Thumbnails: ${noThumb.length}`);
  console.log(`- With Zero Products: ${zeroProducts}`);
  console.log(`- With Products but no valid images: ${prodNoImg}`);
  console.log(`- With Products AND valid images (script bug): ${hasProducts - prodNoImg}`);
  process.exit(0);
}

check();
