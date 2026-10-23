-- Where an inquiry was sent from (the owner, 2026-10-23): WEB, the website (the Android app's Capacitor shell, which
-- loads the website, included), or APP, the AFFHAN app, read off the platform of the session that sent it. For the
-- console's Web / App tags and App inquiries; the open pool and everything else treat the two alike.
--
-- Additive only: one column with a default and one index. Every existing row reads WEB, which is what each of them
-- is; nothing is dropped, renamed, rewritten or copied. On PostgreSQL 11 and later a column with a constant default
-- is added without rewriting the table. Generated with `prisma migrate diff` from the schema at 6d6cae6.

-- AlterTable
ALTER TABLE "Inquiry" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'WEB';

-- CreateIndex
CREATE INDEX "Inquiry_source_idx" ON "Inquiry"("source");
