// Re-file what does not belong in the Men's Clothing family, so "Men's Clothing" shows men's clothing (the
// owner, 2026-10-13, on a phone: women's tops under Men's Clothing > T-Shirts). Re-runnable: a second run
// finds nothing to move.
//
//   - Women's products, anywhere in the family, go to the women's category that matches (TARGETS).
//   - EPROLO's T-shirts, which the import filed whole under Men's > T-Shirts by their group's name, are
//     sorted: men's stay; women's (by their own word, their name, or a women's cut: GARMENT) go to Women's
//     Clothing > Tops & Sets; the rest, neither plainly, go to EPROLO's unisex family as Fashion & Clothing >
//     Unisex T-Shirts (UNISEX_TEES, made if missing).
//
// Who is a woman's product, without a gender attribute for most of the catalogue:
//   - EPROLO's own description says so ("Gender: Female", "Women"): 330 of the 2,490 EPROLO rows in
//     Men's > T-Shirts, where EPROLO's mixed T-shirts were filed whole;
//   - or the name says so plainly ("women", "ladies", "girl", "female", "maternity", ...) and does not name men
//     too. Unisex, couple, "men and women", parent-child wording keeps a product where it is. A name that says
//     neither stays: no guessing from words like "lace" or "v-neck".
// CJ's own sync, which could have filed them back, no longer runs (9db03cb), so the move holds.
//
//   node scripts/refile_womens_from_mens.mjs          # dry run: counts, from -> to, samples
//   node scripts/refile_womens_from_mens.mjs --apply  # move them; writes an undo list first
//
// The undo list (tools/audit/refile-womens-from-mens-<time>.json) holds every product moved with its old and
// new category; `--undo <file>` puts each back. After an apply, run scripts/assign_category_thumbnails.mjs
// --apply (a category's picture may have been one of these) and revalidate the categories and products tags.
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const UNDO = process.argv.includes("--undo") ? process.argv[process.argv.indexOf("--undo") + 1] : null;

// Not "nursing" (nurses' uniforms and care products: "Nursing Staff Clothing", "Nursing Gloves") nor "thong".
const W = /\b(women|womens|woman|ladies|lady|girl|girls|female|pregnant|maternity|breastfeeding|bra|bikini|lingerie|panties)\b|women's|woman's/i;
const M = /\b(men|mens|man|male|boy|boys|gentleman|gentlemen)\b|men's|man's/i;
const BOTH = /unisex|couple|lovers|men and women|men & women|man and woman|for men and|him and her|his and hers|parent[- ]child|family/i;
// For EPROLO's T-shirts only (below): cuts and trims that, in that feed, are women's ("Loose pleated lace
// casual shirt", "Off Shoulder Knitted Top", "backless halter top"). Not for CJ's own men's categories.
const GARMENT = /\b(lace|camisole|cami|crop|cropped|blouse|ruffle|ruffled|puff|bubble sleeve|lantern sleeve|flared sleeve|bell sleeve|off[- ]shoulder|one[- ]shoulder|single shoulder|slanted neck|backless|bodycon|halter|tube top|corset|suspender|sling|strapless|chiffon|sequin|sequined|bow|lotus leaf|ruched|pleated|mesh|see[- ]through|semi[- ]transparent|transparent|knot|tie[- ]up|tie[- ]front|wrap|peplum|square neck|sweetheart|bustier|tank top|vest top|slim fit top|waist cinch|cinching|floral)\b/i;

function statedGender(description) {
  if (!description) return null;
  const m = description.replace(/<[^>]+>/g, "\n").replace(/&nbsp;?/gi, " ").match(/gender\s*[:：]\s*([^\n;|]+)/i);
  return m ? m[1].trim().toLowerCase() : null;
}

/**
 * "women", "men", "both" or "unknown": the product's own word first (EPROLO's description), then its name;
 * but where the two plainly disagree, the name. EPROLO's T-shirt group states "Gender: Male" on 35 tees its
 * own names call women's ("Round neck short sleeved women's t-shirt fun chicken", "T-Shirt for Women"), which
 * the first run (2026-10-13) left under Men's on that word; the name is the product's, the field the group's.
 */
function genderOf(p) {
  const named = genderByName(p.name);
  const g = statedGender(p.description);
  if (g) {
    if (/unisex|both|couple/.test(g)) return "both";
    if (/fem|wom|lad|girl/.test(g)) return named === "men" ? "men" : "women";
    if (/\bmale|\bmen|\bman|boy/.test(g)) return named === "women" ? "women" : "men";
  }
  return named;
}

function genderByName(name) {
  if (BOTH.test(name)) return "both";
  const w = W.test(name);
  const m = M.test(name.replace(/wom[ae]n/gi, ""));
  if (w && !m) return "women";
  if (m && !w) return "men";
  return w && m ? "both" : "unknown";
}

// Each men's category with women's products in it, and the women's one they belong in (by name, under
// Women's Clothing). Anything else found women's in the family goes to the family's Tops & Sets.
const TARGETS = {
  "T-Shirts": "Tops & Sets",
  Print: "Tops & Sets",
  Solid: "Tops & Sets",
  "Man Hoodies & Sweatshirts": "Woman Hoodies & Sweatshirts",
  "Casual Pants": "Pants & Capris",
  "Suits & Blazer": "Blazers",
  "Man Shorts": "Woman Shorts",
  "Man Trench": "Woman Trench",
  Socks: "Woman Socks",
  "Man Gloves & Mittens": "Woman Gloves & Mittens",
  Belts: "Belts & Cummerbunds",
};

// EPROLO's own T-shirts group, which the import matched by name to CJ's Men's Clothing > T-Shirts
// (tools/eprolo/category-resolution.json: EPROLO 37 and 1196 -> C118B8EA...). The ones that are neither
// plainly men's nor plainly women's go back to EPROLO's unisex family, beside its Unisex Hoodies, Jeans and
// Dresses, rather than be guessed into either.
const UNISEX_TEES = { id: "EPROLO-L2-37", name: "Unisex T-Shirts", parentId: "EPROLO-L1-24", parentName: "Fashion & Clothing" };

async function undo(file) {
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  const moves = Array.isArray(saved) ? saved : saved.moves;
  const byFrom = new Map();
  for (const m of moves) {
    if (!byFrom.has(m.from)) byFrom.set(m.from, []);
    byFrom.get(m.from).push(m.id);
  }
  for (const [from, ids] of byFrom) {
    for (let i = 0; i < ids.length; i += 1000) await prisma.product.updateMany({ where: { id: { in: ids.slice(i, i + 1000) } }, data: { categoryId: from } });
    console.log(`put back ${ids.length} into ${from}`);
  }
  // The unisex group, if this run made it and it is empty again.
  if (!Array.isArray(saved) && saved.createdCategory) {
    const left = await prisma.product.count({ where: { categoryId: saved.createdCategory } });
    if (left === 0) {
      await prisma.category.delete({ where: { id: saved.createdCategory } });
      console.log(`removed the category ${saved.createdCategory}`);
    } else console.log(`kept ${saved.createdCategory}: ${left} products are in it`);
  }
}

async function main() {
  if (UNDO) return undo(UNDO);
  const cats = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
  const mens = cats.find((c) => c.name === "Men's Clothing" && !c.parentId);
  const women = cats.find((c) => c.name === "Women's Clothing" && !c.parentId);
  if (!mens || !women) throw new Error("Men's or Women's Clothing not found at the top level");
  const under = (rootId) => {
    const out = [];
    const walk = (id) => {
      out.push(id);
      for (const c of cats) if (c.parentId === id) walk(c.id);
    };
    walk(rootId);
    return out;
  };
  const mensIds = under(mens.id);
  const womensIds = new Set(under(women.id));
  const nameOf = new Map(cats.map((c) => [c.id, c.name]));
  const womensByName = new Map(cats.filter((c) => womensIds.has(c.id)).map((c) => [c.name, c.id]));
  const fallback = womensByName.get("Tops & Sets");
  const tees = cats.find((c) => c.name === "T-Shirts" && c.parentId === mens.id);
  if (!cats.some((c) => c.id === UNISEX_TEES.parentId)) throw new Error(`${UNISEX_TEES.parentName} (${UNISEX_TEES.parentId}) not found`);
  nameOf.set(UNISEX_TEES.id, `${UNISEX_TEES.parentName} > ${UNISEX_TEES.name}`);

  const moves = [];
  for (let cursor = 0; ; ) {
    const batch = await prisma.product.findMany({
      where: { categoryId: { in: mensIds }, id: { gt: cursor } },
      select: { id: true, name: true, description: true, categoryId: true, supplierSource: true },
      orderBy: { id: "asc" },
      take: 5000,
    });
    if (!batch.length) break;
    cursor = batch[batch.length - 1].id;
    for (const p of batch) {
      const g = genderOf(p);
      const eproloTee = p.supplierSource === "EPROLO" && p.categoryId === tees?.id;
      let to = null;
      if (g === "women" || (eproloTee && g === "unknown" && GARMENT.test(p.name))) {
        to = womensByName.get(TARGETS[nameOf.get(p.categoryId)] ?? "") ?? fallback;
      } else if (eproloTee && g !== "men") {
        to = UNISEX_TEES.id;
      }
      if (to) moves.push({ id: p.id, name: p.name, source: p.supplierSource, from: p.categoryId, to });
    }
  }

  const groups = new Map();
  for (const m of moves) {
    const key = `${nameOf.get(m.from)} -> ${nameOf.get(m.to)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  console.log(`To move out of the Men's Clothing family: ${moves.length}`);
  for (const [key, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n${String(list.length).padStart(5)}  ${key}`);
    for (const m of list.slice(0, 3)) console.log(`         ${m.id} [${m.source}] ${m.name.slice(0, 80)}`);
  }
  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to move them (an undo list is written first).");
    return;
  }

  fs.mkdirSync("tools/audit", { recursive: true });
  const file = `tools/audit/refile-womens-from-mens-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const needsUnisex = moves.some((m) => m.to === UNISEX_TEES.id);
  const existed = !!(await prisma.category.findUnique({ where: { id: UNISEX_TEES.id }, select: { id: true } }));
  fs.writeFileSync(
    file,
    JSON.stringify({ createdCategory: needsUnisex && !existed ? UNISEX_TEES.id : null, moves: moves.map(({ id, from, to }) => ({ id, from, to })) }, null, 1),
  );
  console.log(`\nundo list: ${file}`);
  if (needsUnisex && !existed) {
    await prisma.category.create({ data: UNISEX_TEES });
    console.log(`made the category ${UNISEX_TEES.parentName} > ${UNISEX_TEES.name} (${UNISEX_TEES.id})`);
  }
  const byTo = new Map();
  for (const m of moves) {
    if (!byTo.has(m.to)) byTo.set(m.to, []);
    byTo.get(m.to).push(m.id);
  }
  let moved = 0;
  for (const [to, ids] of byTo) {
    for (let i = 0; i < ids.length; i += 1000) {
      const r = await prisma.product.updateMany({ where: { id: { in: ids.slice(i, i + 1000) }, categoryId: { in: mensIds } }, data: { categoryId: to } });
      moved += r.count;
    }
  }
  console.log(`moved ${moved} of ${moves.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
