// Creates the Postgres full-text search index that the unified search core
// (src/lib/search.ts) relies on. Run once per database:
//
//   node scripts/create_search_index.mjs
//
// It is a raw GIN expression index on to_tsvector('english', name), built
// CONCURRENTLY so it never locks the Product table (safe to run against a live
// DB). Prisma does not manage GIN expression indexes in schema.prisma, so this
// lives as a standalone, idempotent migration script. Without it, search still
// works but falls back to a slow sequential scan.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Creating product_name_fts_idx (GIN, english) CONCURRENTLY …");
  const start = Date.now();
  await prisma.$executeRawUnsafe(
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS product_name_fts_idx
       ON "Product" USING GIN (to_tsvector('english', "name"))`
  );
  console.log(`Done in ${Date.now() - start}ms.`);
}

main()
  .catch((e) => {
    console.error("Failed to create search index:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
