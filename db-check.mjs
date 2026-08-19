import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  try {
    const total = await prisma.product.count();
    console.log("Total products:", total);

    const s3Count = await prisma.product.count({
      where: { imageUrl: { contains: "affan-product-images.s3" } }
    });
    
    const cjCount = await prisma.product.count({
      where: { 
        OR: [
          { imageUrl: { contains: "aliyuncs.com" } },
          { imageUrl: { contains: "cjdropshipping" } }
        ]
      }
    });

    const otherCount = total - (s3Count + cjCount);

    console.log("S3 Count:", s3Count, `(${((s3Count/total)*100).toFixed(2)}%)`);
    console.log("CJ Count:", cjCount, `(${((cjCount/total)*100).toFixed(2)}%)`);
    console.log("Other Count:", otherCount, `(${((otherCount/total)*100).toFixed(2)}%)`);

    const s3Sample = await prisma.product.findMany({
      where: { imageUrl: { contains: "affan-product-images.s3" } },
      take: 5,
      select: { imageUrl: true }
    });
    console.log("\nS3 Samples:");
    s3Sample.forEach(s => console.log(s.imageUrl));

    const cjSample = await prisma.product.findMany({
      where: { 
        OR: [
          { imageUrl: { contains: "aliyuncs.com" } },
          { imageUrl: { contains: "cjdropshipping" } }
        ]
      },
      take: 5,
      select: { imageUrl: true }
    });
    console.log("\nCJ Samples:");
    cjSample.forEach(s => console.log(s.imageUrl));

    const otherSample = await prisma.product.findMany({
      where: { 
        NOT: [
          { imageUrl: { contains: "affan-product-images.s3" } },
          { imageUrl: { contains: "aliyuncs.com" } },
          { imageUrl: { contains: "cjdropshipping" } }
        ]
      },
      take: 5,
      select: { imageUrl: true }
    });
    console.log("\nOther Samples:");
    otherSample.forEach(s => console.log(s.imageUrl));

  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
run();
