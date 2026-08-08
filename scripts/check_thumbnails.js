const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const total = await prisma.category.count();
  const withThumb = await prisma.category.count({ where: { thumbnailUrl: { not: null, not: '' } } });
  const noThumb = await prisma.category.count({ where: { OR: [{ thumbnailUrl: null }, { thumbnailUrl: '' }] } });
  const samples = await prisma.category.findMany({ 
    where: { thumbnailUrl: { not: null, not: '' } }, 
    take: 5, 
    select: { id: true, name: true, thumbnailUrl: true } 
  });
  
  console.log('\n--- THUMBNAIL EVIDENCE ---');
  console.log(`Total Categories: ${total}`);
  console.log(`With Thumbnail: ${withThumb}`);
  console.log(`Null/Empty Thumbnail: ${noThumb}`);
  console.log('\nSample Rows:');
  console.table(samples);
  process.exit(0);
}

check();
