import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
async function main() {
  const p = await prisma.product.findUnique({ where: { id: 1203964 } });
  if (p) {
    console.log('Product', p.id);
    console.log('Contains eprolo:', p.description.includes('eprolo'));
    console.log('Contains aliyuncs:', p.description.includes('aliyuncs'));
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    let match;
    while ((match = imgRegex.exec(p.description)) !== null) {
      console.log('IMG:', match[1]);
    }
  }
}
main().finally(() => prisma.$disconnect());
