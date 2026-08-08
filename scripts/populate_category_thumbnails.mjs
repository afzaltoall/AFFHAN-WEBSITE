import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const force = process.argv.includes("--force");
  
  console.log(`Starting thumbnail population. Force mode: ${force}`);
  
  // Find all categories
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, thumbnailUrl: true }
  });
  
  console.log(`Found ${categories.length} categories.`);
  
  let processed = 0;
  let skipped = 0;
  let updated = 0;
  let noImageFound = 0;
  
  for (const category of categories) {
    processed++;
    if (!force && category.thumbnailUrl) {
      skipped++;
      continue;
    }
    
    // Find latest product with an image for this category
    const latestProduct = await prisma.product.findFirst({
      where: {
        categoryId: category.id,
        imageUrl: { not: null, not: "" }
      },
      orderBy: {
        id: 'desc'
      },
      select: {
        imageUrl: true
      }
    });
    
    if (latestProduct && latestProduct.imageUrl) {
      await prisma.category.update({
        where: { id: category.id },
        data: { thumbnailUrl: latestProduct.imageUrl }
      });
      updated++;
      if (updated % 50 === 0) {
        console.log(`Progress: ${processed}/${categories.length} - Updated ${updated}, Skipped ${skipped}, No Image ${noImageFound}`);
      }
    } else {
      noImageFound++;
    }
  }
  
  console.log(`\nFinished!`);
  console.log(`Total categories: ${categories.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`No image found: ${noImageFound}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
