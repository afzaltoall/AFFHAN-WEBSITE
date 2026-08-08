// One-time migration: create the "PasswordResetToken" table via raw SQL.
// Run with:  node --env-file=.env scripts/migrate-reset-tokens.mjs
// (Using raw SQL + a standalone script avoids regenerating the Prisma client
// while the Windows dev server holds an EPERM lock on the query engine.)

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "email" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
await prisma.$executeRawUnsafe(`
  CREATE INDEX IF NOT EXISTS "PasswordResetToken_email_idx"
  ON "PasswordResetToken" ("email");
`);
console.log('✓ "PasswordResetToken" table ready');

// Verify the migration actually applied (this project has repeatedly hit
// "the CLI exited but the schema didn't change" — so we check the columns).
const cols = await prisma.$queryRawUnsafe(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'PasswordResetToken' ORDER BY ordinal_position;
`);
console.log("✓ columns:", cols.map(c => c.column_name).join(", "));

await prisma.$disconnect();
