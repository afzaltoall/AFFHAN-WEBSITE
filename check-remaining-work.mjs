import fs from "fs";
import { PrismaClient } from "@prisma/client";

const envContent = fs.readFileSync(".env", "utf8");
envContent.split("\n").forEach((line) => {
  const [key, ...rest] = line.split("=");
  if (key && rest.length > 0 && !key.startsWith("#")) {
    process.env[key.trim()] = rest.join("=").trim().replace(/^"|"$|^'|'$/g, "");
  }
});

const prisma = new PrismaClient();

async function run() {
  const totalProducts = await prisma.product.count();
  const totalModeration = await prisma.moderationLog.count();

  console.log(`\n=== OVERALL STATUS ===`);
  console.log(`Total products in DB: ${totalProducts}`);
  console.log(`Total moderation log entries: ${totalModeration}`);
  console.log(`Combined (unique CJ products touched): ${totalProducts + totalModeration}`);

  const statusCounts = await prisma.syncProgress.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log(`\n=== SYNC PROGRESS STATUS ===`);
  statusCounts.forEach((s) => console.log(`  ${s.status}: ${s._count}`));

  // Per-category breakdown for remaining (PARTIAL_LIMIT_REACHED) categories
  const partial = await prisma.syncProgress.findMany({
    where: { status: "PARTIAL_LIMIT_REACHED" },
    include: { category: true },
  });

  console.log(`\n=== PER-CATEGORY: PRODUCTS ALREADY IN DB (for remaining ${partial.length} categories) ===`);
  let totalAlreadyInThese = 0;
  for (const p of partial) {
    const count = await prisma.product.count({ where: { categoryId: p.categoryId } });
    totalAlreadyInThese += count;
    console.log(`  ${p.category.name}: ${count} products already in DB`);
  }
  console.log(`\nTotal already in DB across these ${partial.length} remaining categories: ${totalAlreadyInThese}`);

  await prisma.$disconnect();
}

run().catch(console.error);
