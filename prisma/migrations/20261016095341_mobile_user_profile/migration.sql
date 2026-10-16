-- The customer's company and address on their account, for the app's "Complete your profile" (the owner,
-- 2026-10-16; branch feat/app-routes). Generated with `prisma migrate diff` from main's schema. Seven new
-- columns, all optional and without a default: Postgres records each without rewriting the table, and no
-- existing row or column changes.
--
-- The project changes its schema with `db push` and has no migration history, so this is applied by hand, on
-- a Neon branch first, and on production only with the owner's go:
--
--   npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20261016095341_mobile_user_profile/migration.sql
--
-- BEFORE the code is deployed: every signed-in request reads the whole account row (verifyMobileSession), so
-- code that knows these columns, running against a database without them, fails every sign-in.
--
-- Never `prisma migrate dev` / `migrate deploy` against this database: with no history, migrate dev sees drift
-- and offers to reset it.

-- AlterTable
ALTER TABLE "MobileUser" ADD COLUMN     "addressLine1" TEXT,
ADD COLUMN     "addressLine2" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "postalCode" TEXT,
ADD COLUMN     "state" TEXT;
