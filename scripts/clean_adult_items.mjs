// Targeted removal of genuinely adult / 18+ product LISTINGS that slipped into
// otherwise-normal categories (crotchless lingerie, sex toys, fetish gear,
// pasties, erotic underwear, etc.). Moves them to ModerationLog.
//
//   node scripts/clean_adult_items.mjs          # dry run (lists exact hits)
//   node scripts/clean_adult_items.mjs --apply  # move them into ModerationLog
//
// Deliberately EXCLUDES false positives so we don't remove legit products:
//   - feminine-health supplements (probiotics, gummies, test strips…)
//   - baby split-crotch clothing (normal infant wear)
//   - athletic anti-chafing nipple covers / fashion nubra
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const contains = (k) => ({ name: { contains: k, mode: "insensitive" } });

// Genuinely adult signals. (Note: "vibrator" is intentionally OMITTED — in this
// catalog every "vibrator/vibratory" hit is a construction tool, not a sex toy.)
const INCLUDE = [
  "crotchless", "open crotch", "open-crotch", "crotch opening", "open breasts",
  "bodystocking", "adult product", "erotic", "masturbat", "fetish",
  "sex toy", "sex-toy", "sex doll", "dildo", "strap-on",
  "butt plug", "buttplug", "anal plug", "anal beads", "g-string",
  "negligee", "pasties", "flirting toy", "sm props", "bdsm", "bondage",
  "vaginal irrigation", "vaginal mask", "vaginal simulation", "sexy leather panties",
];
// Keep-these guards (health / baby / athletic / fashion / tool false positives).
const EXCLUDE = [
  "probiotic", "gummies", "gummy", "capsule", "test strip", "vitamin",
  "ph balance", "supplement", "fudge", "discharge test", "tightening gel",
  "repair capsule", "prebio", "balance pills", "balance gummies",
  "running", "cycling", "anti-chafing", "anti chafing", "nubra", "anti-exposure",
  "baby", "boys", "boy ", "children", "children's", "toddler", "infant", "kids", "parent-child",
  "vibratory", "tumbler", "tile", "concrete", "floor", "polishing", "masonry",
  "nail polish", "nail art", "press on nail", "press-on nail",
];
// Categories that are for kids — never touch products filed under these.
const KID_CAT_RX = /baby|infant|toddler|\bkid|children|\bboy|\bgirl/i;

async function main() {
  const cats = await prisma.category.findMany({ select: { id: true, name: true } });
  const nameById = new Map(cats.map((c) => [c.id, c.name]));
  const kidCatIds = cats.filter((c) => KID_CAT_RX.test(c.name)).map((c) => c.id);
  const where = {
    AND: [
      { OR: INCLUDE.map(contains) },
      { NOT: { OR: EXCLUDE.map(contains) } },
      { categoryId: { notIn: kidCatIds } },
    ],
  };

  const rows = await prisma.product.findMany({ where, select: { id: true, cjPid: true, name: true, categoryId: true } });
  console.log(`Adult / 18+ product listings to remove: ${rows.length}\n`);
  rows.forEach((r) => console.log("   - [" + (nameById.get(r.categoryId) || "?") + "] " + r.name.slice(0, 66)));

  if (!APPLY) { console.log("\nDry run. Re-run with --apply to move them into ModerationLog."); return; }

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await prisma.moderationLog.createMany({
      data: batch.map((r) => ({ cjPid: r.cjPid, name: r.name, categoryName: nameById.get(r.categoryId) ?? null, flaggedKeyword: "adult-item" })),
    });
    await prisma.product.deleteMany({ where: { id: { in: batch.map((r) => r.id) } } });
  }
  console.log(`\nDone. Moved ${rows.length} adult listings into ModerationLog.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
