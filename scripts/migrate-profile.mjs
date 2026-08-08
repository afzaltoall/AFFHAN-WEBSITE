// Adds profile fields: User.phone, and links inquiries to the user who
// submitted them (Inquiry.userId). Raw SQL so we don't need to regenerate
// the Prisma client while the Windows dev server holds a lock.
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;`);
console.log('✓ User.phone ready');

await prisma.$executeRawUnsafe(`ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "userId" TEXT;`);
console.log('✓ Inquiry.userId ready');

await prisma.$disconnect();
