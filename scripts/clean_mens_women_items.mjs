// One-off (re-runnable) cleanup: CJ mis-files many women-only products inside
// the Men's Clothing subtree (e.g. a women's thong sitting in "Man Shorts").
// There is no gender attribute in the data, so we match on the product NAME:
// move anything that names a women-only item into ModerationLog — but KEEP
// genuinely unisex products ("for men and women", "couple", "unisex").
//
//   node scripts/clean_mens_women_items.mjs          # dry run (counts + samples)
//   node scripts/clean_mens_women_items.mjs --apply  # move them to ModerationLog
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// Women-only signals in a product name.
const WOMEN_KEYWORDS = [
  "women", "womens", "women's", "woman", "ladies", "lady", "female",
  "girl", "girls", "thong", "panties", "panty", "lingerie", "bikini",
  "maternity", "menstrual", "sanitary", "brassiere",
];
// Phrases that mean the item is unisex / includes men — never remove these.
const UNISEX_PHRASES = [
  "men and women", "men & women", "men's and women's", "man and woman",
  "men women", "male and female", "unisex", "for men and", "couple",
  "him and her", "his and her", "and women", "& women",
];

async function main() {
  const all = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
  const childrenMap = new Map();
  for (const c of all) if (c.parentId) (childrenMap.get(c.parentId) || childrenMap.set(c.parentId, []).get(c.parentId)).push(c.id);
  const mens = all.find((c) => c.name === "Men's Clothing" && !c.parentId);
  if (!mens) { console.log("No 'Men's Clothing' top category found."); return; }

  const sub = [mens.id];
  const queue = [mens.id];
  while (queue.length) { const cur = queue.shift(); for (const ch of childrenMap.get(cur) || []) { sub.push(ch); queue.push(ch); } }

  const where = {
    categoryId: { in: sub },
    OR: WOMEN_KEYWORDS.map((k) => ({ name: { contains: k, mode: "insensitive" } })),
    NOT: { OR: UNISEX_PHRASES.map((u) => ({ name: { contains: u, mode: "insensitive" } })) },
  };

  const total = await prisma.product.count({ where });
  console.log(`Men's Clothing subtree categories: ${sub.length}`);
  console.log(`Women-only products mis-filed under Men's Clothing: ${total}`);

  if (!APPLY) {
    const samp = await prisma.product.findMany({ where, select: { name: true }, take: 20 });
    console.log("\nSamples:");
    samp.forEach((s) => console.log("   -", s.name.slice(0, 70)));
    console.log("\nDry run. Re-run with --apply to move them into ModerationLog.");
    return;
  }

  const nameById = new Map(all.map((c) => [c.id, c.name]));
  let moved = 0;
  const BATCH = 1000;
  for (;;) {
    const batch = await prisma.product.findMany({ where, select: { id: true, cjPid: true, name: true, categoryId: true }, take: BATCH });
    if (batch.length === 0) break;
    await prisma.moderationLog.createMany({
      data: batch.map((p) => ({ cjPid: p.cjPid, name: p.name, categoryName: nameById.get(p.categoryId) ?? null, flaggedKeyword: "mens-women-mismatch" })),
    });
    await prisma.product.deleteMany({ where: { id: { in: batch.map((p) => p.id) } } });
    moved += batch.length;
    console.log(`  moved ${moved}/${total}…`);
  }
  console.log(`Done. Moved ${moved} mis-filed women-only products into ModerationLog.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
