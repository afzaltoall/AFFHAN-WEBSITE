-- The database load of 2026-10-14 (branch perf/db-load). Generated with `prisma migrate diff` from main's
-- schema; nothing here rewrites or deletes data. The project changes its schema with `db push` and has no
-- migration history, so this is applied by hand, on a Neon branch first, and on production only with the
-- owner's go:
--
--   1. this file:            npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20261014104914_db_load/migration.sql
--   2. product-index.sql, on its own (CREATE INDEX CONCURRENTLY cannot run inside a transaction)
--   3. node scripts/backfill_blocked_names.mjs --apply    (until then every product reads as not blocked)
--   4. deploy the code, then GET /api/cron/refresh/?force=1 with CRON_SECRET (counts and the homepage's draws)
--
-- Never `prisma migrate dev` / `migrate deploy` against this database: with no history, migrate dev sees drift
-- and offers to reset it.

-- A constant default: Postgres 11+ records it without rewriting the table's million rows.
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "isBlockedName" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "productCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Snapshot" (
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Snapshot_kind_computedAt_idx" ON "Snapshot"("kind", "computedAt" DESC);
