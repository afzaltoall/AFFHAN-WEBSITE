// Physically moves every product in a moderation-blocked category (see
// src/lib/moderation.ts) into ModerationLog and deletes it from Product.
//
//   node scripts/moderate_categories.mjs          # dry run (counts only)
//   node scripts/moderate_categories.mjs --apply  # actually move + delete
//
// The API layer already HIDES these products from the site, so this is only
// needed if you want them gone from the Product table entirely. It is safe to
// re-run; a future sync will not re-add them (the sync skips blocked
// categories). Deleted products can always be re-synced from CJ if a category
// is later un-blocked.
import { PrismaClient } from "@prisma/client";

// Keep in sync with src/lib/moderation.ts (kept literal here so the script has
// no dependency on the TS build).
const BLOCKED_CATEGORY_PATTERNS = [
  "woman shorts", "women shorts", "women's shorts", "legging",
  "pants & capris", "pants and capris", "capris", "one-piece suit",
  "one piece suits", "bikini", "two-piece suit", "two piece suits",
  "blazers", "short-sleeved shirts", "short sleeved shirts",
  "underwear & loungewear", "underwear and loungewear", "pajama sets",
  "adult wellness", "adult product",
  "weddings & events", "weddings and events",
  "belts & cummerbunds", "belts and cummerbunds", "cummerbund",
];
const isBlockedName = (name) => {
  const n = (name || "").trim().toLowerCase();
  return BLOCKED_CATEGORY_PATTERNS.some((p) => n.includes(p));
};
// Descendant-aware: blocked if own name matches OR any ancestor's name matches
// (products attach to leaves, so blocking a parent must catch its whole subtree).
const buildDeepBlocked = (cats) => {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const memo = new Map();
  const deep = (id, seen = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (seen.has(id)) return false;
    seen.add(id);
    const c = byId.get(id);
    if (!c) return false;
    const b = isBlockedName(c.name) || (c.parentId ? deep(c.parentId, seen) : false);
    memo.set(id, b);
    return b;
  };
  return new Set(cats.filter((c) => deep(c.id)).map((c) => c.id));
};

// Adult name keywords (see src/lib/moderation.ts BLOCKED_NAME_KEYWORDS).
const BLOCKED_NAME_KEYWORDS = ["bikini", "g-string", "gstring", "g string"];
const isNameBlocked = (name) => {
  const n = (name || "").toLowerCase();
  return BLOCKED_NAME_KEYWORDS.some((k) => n.includes(k));
};

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const cats = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
  const blockedSet = buildDeepBlocked(cats);
  const blocked = cats.filter((c) => blockedSet.has(c.id));
  console.log(`Blocked categories (${blocked.length}):`, blocked.map((c) => c.name).join(", ") || "(none)");
  if (blocked.length === 0) return;

  const blockedIds = blocked.map((c) => c.id);
  // Match products in a blocked category OR with an adult name keyword.
  const where = {
    OR: [
      { categoryId: { in: blockedIds } },
      ...BLOCKED_NAME_KEYWORDS.map((k) => ({ name: { contains: k, mode: "insensitive" } })),
    ],
  };
  const total = await prisma.product.count({ where });
  console.log(`Products to moderate (blocked category OR adult name): ${total}`);
  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to move them into ModerationLog and delete from Product.");
    return;
  }

  const nameById = new Map(blocked.map((c) => [c.id, c.name]));
  let moved = 0;
  const BATCH = 1000;
  // Loop batches until none remain.
  for (;;) {
    const batch = await prisma.product.findMany({
      where,
      select: { id: true, cjPid: true, name: true, categoryId: true },
      take: BATCH,
    });
    if (batch.length === 0) break;
    await prisma.moderationLog.createMany({
      data: batch.map((p) => ({
        cjPid: p.cjPid,
        name: p.name,
        categoryName: nameById.get(p.categoryId) ?? null,
        flaggedKeyword: "blocked-category",
      })),
    });
    await prisma.product.deleteMany({ where: { id: { in: batch.map((p) => p.id) } } });
    moved += batch.length;
    console.log(`  moved ${moved}/${total}…`);
  }
  console.log(`Done. Moved ${moved} products into ModerationLog.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
