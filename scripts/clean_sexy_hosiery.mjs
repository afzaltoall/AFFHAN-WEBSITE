// Removes sexy / exotic hosiery & gloves that sit inside otherwise-normal
// accessory categories (Woman Socks, Woman Gloves & Mittens) — sheer tights,
// crotchless/open-toe stockings, suspenders, fishnet, patent-leather / latex /
// opera gloves, etc. Keeps ordinary socks (cotton, athletic, novelty, cute) and
// ordinary gloves (winter, gardening, sun sleeves, braces).
//
//   node scripts/clean_sexy_hosiery.mjs          # dry run
//   node scripts/clean_sexy_hosiery.mjs --apply  # move to ModerationLog
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const contains = (k) => ({ name: { contains: k, mode: "insensitive" } });

const TARGETS = [
  {
    category: "Woman Socks",
    include: [
      "sheer", "pantyhose", "suspender", "garter", "fishnet", "crotch",
      "toeless", "thigh high", "thigh-high", "oil shiny", "oil-shiny",
      "oil-soaked", "see-through", "see through", "temptation", "bodystocking",
      "sexy", "silk stocking", "lace stocking", "mesh stocking", "hold up",
      "hold-up", "stockings", "tights", "hosiery", "10d", "15d", "20d", "30d", "40d",
    ],
    exclude: [
      "santa", "christmas", "xmas", "basketball", "football", "soccer", "sport",
      "athletic", "compression", "varicose", "medical", "no-show", "no show",
      "invisible", "ankle sock", "boat sock", "yoga", "hiking", "running",
      "cycling", "grip", "trampoline", "diabetic", "arch support", "pilates",
      "gym", "newborn", "baby", "kids", "children", "boys", "toddler",
    ],
  },
  {
    category: "Woman Gloves & Mittens",
    include: [
      "patent leather", "latex", "opera", "elbow-length", "elbow length",
      "over the elbow", "fishnet", "sexy", "transparent mesh", "50cm", "60cm",
      "70cm", "satin long", "lace-up long", "sexy mesh",
    ],
    exclude: [
      "sun", "ice sleeve", "wrist", "arm guard", "volleyball", "tennis", "brace",
      "mosquito", "cycling", "gardening", "garden", "winter", "knit",
      "touch screen", "touchscreen", "driving", "oven", "cleaning", "dishwash",
      "gym", "fitness", "boxing", "work glove",
      // latex false positives — household / medical / sport, NOT sexy
      "household", "disposable", "goalkeeper", "goalie", "finger cot",
      "waterproof", "antifouling", "protection", "powder free", "powder-free",
      "surgical", "children", "kids", "nitrile", "food grade", "food-grade",
      "hanging finger sleeve", "sleeve cover",
    ],
  },
];

async function main() {
  const cats = await prisma.category.findMany({ select: { id: true, name: true } });
  let grand = 0;
  for (const t of TARGETS) {
    const cat = cats.find((c) => c.name === t.category);
    if (!cat) { console.log(`(!) category not found: ${t.category}`); continue; }
    const where = {
      categoryId: cat.id,
      AND: [{ OR: t.include.map(contains) }, { NOT: { OR: t.exclude.map(contains) } }],
    };
    const rows = await prisma.product.findMany({ where, select: { id: true, cjPid: true, name: true } });
    console.log(`\n### ${t.category}: ${rows.length} sexy/exotic items to remove`);
    rows.slice(0, 14).forEach((r) => console.log("   - " + r.name.slice(0, 62)));
    grand += rows.length;
    if (APPLY && rows.length) {
      const B = 500;
      for (let i = 0; i < rows.length; i += B) {
        const batch = rows.slice(i, i + B);
        await prisma.moderationLog.createMany({ data: batch.map((r) => ({ cjPid: r.cjPid, name: r.name, categoryName: t.category, flaggedKeyword: "sexy-hosiery" })) });
        await prisma.product.deleteMany({ where: { id: { in: batch.map((r) => r.id) } } });
      }
      console.log(`   -> moved ${rows.length}`);
    }
  }
  console.log(`\n${APPLY ? "Moved" : "Would move"} ${grand} products total.`);
  if (!APPLY) console.log("Dry run. Re-run with --apply.");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
