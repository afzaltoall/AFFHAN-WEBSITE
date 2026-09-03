/**
 * Lift chosen categories to the top of the menu — and put them back.
 *
 * Display only. Nothing here touches parentId, product links, or anything the
 * CJ sync reads or writes; the real tree is exactly as CJ sends it, and this
 * only decides what the menu draws at the top.
 *
 *   node scripts/promote_categories.mjs          apply the list below
 *   node scripts/promote_categories.mjs --revert clear every flag and label
 *   node scripts/promote_categories.mjs --status what is promoted right now
 *
 * Reverting is also one statement, if the script is not to hand:
 *   UPDATE "Category" SET "displayAsTopLevel" = false, "displayLabel" = NULL;
 *
 * Categories are matched by name, and by parent where a name is not unique —
 * "Outerwear & Jackets", "Bottoms" and "Accessories" each exist under both
 * Men's and Women's Clothing. The script refuses to write anything unless
 * every line matches exactly one row, so a rename upstream fails loudly here
 * rather than silently promoting the wrong half of a pair.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** [ name, parent name or null when unambiguous, display label or null ] */
const PROMOTIONS = [
  // Level-2 nodes, keeping their own names.
  ["Women's Shoes", null, null],
  ["Men's Shoes", null, null],
  ["Women's Luggage & Bags", null, null],
  ["Toys & Hobbies", null, null],
  ["T-Shirts", null, null],
  ["Sportswear", null, null],
  ["Skin Care", null, null],
  ["Portable Audio & Video", null, null],
  ["Pet Apparels", null, null],
  ["Nail Art & Tools", null, null],
  ["Mobile Phone Accessories", null, null],
  ["Men's Watches", null, null],
  ["Makeup", null, null],
  ["Kitchen, Dining & Bar", null, null],
  ["Indoor Lighting", null, null],
  ["Home Textiles", null, null],
  ["Girls Clothing", null, null],
  ["Fine Jewelry", null, null],
  ["Festive & Party Supplies", null, null],
  ["Cases & Covers", null, null],
  ["Boys Clothing", null, null],
  ["Baby Clothing", null, null],
  ["Auto Replacement Parts", null, null],

  // Level-2 nodes whose own name would be ambiguous at the top level.
  ["Outerwear & Jackets", "Women's Clothing", "Women's Outerwear & Jackets"],
  ["Outerwear & Jackets", "Men's Clothing", "Men's Outerwear & Jackets"],
  ["Bottoms", "Men's Clothing", "Men's Bottoms"],
  ["Bottoms", "Women's Clothing", "Women's Bottoms"],
  ["Accessories", "Women's Clothing", "Women's Accessories"],
  ["Tops & Sets", "Women's Clothing", "Women's Tops & Sets"],
  ["Tools", null, "Tools & Hardware"],
  ["Men's Luggage & Bags", null, "Backpacks & Luggage"],

  // Leaves big and coherent enough to stand on their own.
  ["Furniture", "Home Storage", null],
  ["Earrings", "Fashion Jewelry", null],
  ["Necklace & Pendants", "Fashion Jewelry", null],
  ["Rings", "Fashion Jewelry", null],
  ["Bracelets & Bangles", "Fashion Jewelry", null],
];

async function main() {
  const mode = process.argv.includes("--revert")
    ? "revert"
    : process.argv.includes("--status")
      ? "status"
      : "apply";

  const cats = await prisma.category.findMany({
    select: { id: true, name: true, parentId: true, displayAsTopLevel: true, displayLabel: true },
  });
  const byId = new Map(cats.map((c) => [c.id, c]));
  const parentOf = (c) => (c.parentId ? byId.get(c.parentId)?.name ?? "(missing)" : "(root)");

  if (mode === "status") {
    const on = cats.filter((c) => c.displayAsTopLevel);
    console.log(`promoted: ${on.length}`);
    for (const c of on.sort((a, b) => (a.displayLabel ?? a.name).localeCompare(b.displayLabel ?? b.name))) {
      console.log(`  ${(c.displayLabel ?? c.name).padEnd(32)} (real: ${c.name}, under ${parentOf(c)})`);
    }
    console.log(`real level-1 rows (unchanged): ${cats.filter((c) => !c.parentId).length}`);
    return;
  }

  if (mode === "revert") {
    const { count } = await prisma.category.updateMany({
      where: { OR: [{ displayAsTopLevel: true }, { displayLabel: { not: null } }] },
      data: { displayAsTopLevel: false, displayLabel: null },
    });
    console.log(`reverted ${count} categories — the menu is back to CJ's own top level.`);
    return;
  }

  // Resolve every line first. Nothing is written until all 36 are unambiguous,
  // so a partial application cannot happen.
  const targets = [];
  const failures = [];
  for (const [name, parent, label] of PROMOTIONS) {
    let hits = cats.filter((c) => c.name === name);
    if (parent) hits = hits.filter((c) => parentOf(c) === parent);
    if (hits.length !== 1) {
      failures.push(`${name}${parent ? ` (under ${parent})` : ""} matched ${hits.length} rows`);
      continue;
    }
    targets.push({ id: hits[0].id, label });
  }

  if (failures.length) {
    console.error("Refusing to write — these did not resolve to exactly one category:");
    failures.forEach((f) => console.error("  " + f));
    process.exitCode = 1;
    return;
  }

  // Start from a clean slate, so removing a line from the list above actually
  // removes the promotion rather than leaving it stuck on.
  await prisma.category.updateMany({
    where: { OR: [{ displayAsTopLevel: true }, { displayLabel: { not: null } }] },
    data: { displayAsTopLevel: false, displayLabel: null },
  });

  for (const t of targets) {
    await prisma.category.update({
      where: { id: t.id },
      data: { displayAsTopLevel: true, displayLabel: t.label },
    });
  }

  console.log(`promoted ${targets.length} categories (${targets.filter((t) => t.label).length} with a display label).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
