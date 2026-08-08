// One-time migration: create the "PasswordChangeLog" audit table via raw SQL.
// Run with:  node --env-file=.env scripts/migrate-password-log.mjs
// Records every successful password change (self-service change + OTP reset)
// so admins can see who changed their password, how, and from where.

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

await prisma.$executeRawUnsafe(`
  CREATE TABLE IF NOT EXISTS "PasswordChangeLog" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "method" TEXT NOT NULL,        -- 'change-password' | 'reset-otp'
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
await prisma.$executeRawUnsafe(`
  CREATE INDEX IF NOT EXISTS "PasswordChangeLog_createdAt_idx"
  ON "PasswordChangeLog" ("createdAt");
`);
console.log('✓ "PasswordChangeLog" table ready');

const cols = await prisma.$queryRawUnsafe(`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'PasswordChangeLog' ORDER BY ordinal_position;
`);
console.log("✓ columns:", cols.map(c => c.column_name).join(", "));

await prisma.$disconnect();
