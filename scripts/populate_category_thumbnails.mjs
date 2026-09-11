// ---------------------------------------------------------------------------
// SUPERSEDED 2026-09-10 — do not run. Use:
//     node scripts/assign_category_thumbnails.mjs --apply
//
// This script assigned a category the first product image it found, with no
// check that another category already used it. Between this and the cron
// backfill, 13 images were shared by 26 categories, and on the top-level grid
// five parent tiles showed the same photo as their own promoted child sitting
// next to them — Men's Clothing = T-Shirts, Jewelry & Watches = Fine Jewelry,
// and so on. Women's Clothing (89,067 products) displayed the picture of
// "Suit", a 2-product subcategory, because the descendant walk visited
// children in database row order rather than by size.
//
// The replacement assigns bottom-up and claims each image exclusively, so no
// two categories can share one. Running this file again would reintroduce
// duplicates it cannot detect.
// ---------------------------------------------------------------------------
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
