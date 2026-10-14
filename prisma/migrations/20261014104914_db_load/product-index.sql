-- Step 2 of 20261014104914_db_load (see migration.sql): a category's shown products, newest first, for the
-- catalogue's per-category scans, the homepage's draws and the daily counts. The same index schema.prisma
-- declares (map "Product_categoryId_isBlockedName_id_desc_idx"), so `prisma db push` keeps it.
--
-- CONCURRENTLY, so the table stays writable while it builds (the (categoryId, id DESC) index beside it took
-- ~5s and 66MB this way). It cannot run in a transaction: run this file on its own, as its only statement.
-- IF NOT EXISTS makes a second run harmless; a build that was interrupted leaves an INVALID index, which
-- `DROP INDEX CONCURRENTLY "Product_categoryId_isBlockedName_id_desc_idx";` clears before trying again.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Product_categoryId_isBlockedName_id_desc_idx" ON "Product"("categoryId", "isBlockedName", "id" DESC);
