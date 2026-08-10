-- If you already ran the CREATE TABLE "ScrapedProduct" earlier, just run this
-- ALTER to add the category column (safe to re-run, IF NOT EXISTS guards it):
ALTER TABLE "ScrapedProduct" ADD COLUMN IF NOT EXISTS category TEXT;

-- Run once in Neon SQL Editor before using the scraper.
-- Adds source tracking so 1688 / DHgate / Global Sources / Made-in-China
-- products can coexist with your existing CJ-sourced rows without collisions.

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'cj';
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;

-- Backfill existing rows so they're tagged correctly
UPDATE "Product" SET "sourceId" = "cjPid" WHERE "sourceId" IS NULL;

-- Prevent duplicate inserts for the same product from the same source
CREATE UNIQUE INDEX IF NOT EXISTS product_source_unique
  ON "Product" ("source", "sourceId");
