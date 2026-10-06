// Build the search's lexicon from the catalogue's own words.
//
//   node scripts/build_search_lexicon.mjs        # writes src/lib/searchLexicon.json
//
// Read-only on the database. Run it again when the catalogue changes shape
// (a new supplier feed, a big sync): the words people search for are the
// words products are named with, and those move slowly.
//
// What it writes:
//
//   words     the catalogue's vocabulary, most frequent first. Typos are
//             corrected to these (searchIntent.correctWords): "moblie" →
//             "mobile" only because "mobile" is a word products are named
//             with.
//   phrases   what to complete a search to as it is typed, the way Amazon
//             and Flipkart do: "car s" → "car seat cover", "car sticker".
//             Two to four words that at least ~125 product names share,
//             ending on a thing (a head noun of a category name, or one the
//             catalogue names products with), never on whom it is for unless
//             said with "for" ("dress for women", not "dress women"), with
//             the number of names that have it. Category names themselves
//             are not here: the search shows them as categories, by their
//             own names, from the category list.
//
// Counted over a 20% block sample of Product, so the scan stays light; the
// counts are scaled back up, and only their order matters.
import "dotenv/config";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { categoryHeads, nameWords, stem } from "../src/lib/searchIntent.ts";

const OUT = new URL("../src/lib/searchLexicon.json", import.meta.url);
const SAMPLE_PERCENT = 20;
const MIN_NAMES = 25; // in the sample: ~125 names in the catalogue
const MAX_PHRASES = 4500;
const MAX_WORDS = 7000;

// Words a completion should not start or end on: grammar, filler, and the
// adjectives every listing uses.
const EDGE_STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "by", "for", "with", "from", "as", "is", "are", "be",
  "new", "hot", "fashion", "fashionable", "stylish", "style", "creative", "simple", "cute", "luxury", "popular",
  "trendy", "quality", "high", "latest", "best", "cheap", "wholesale", "free", "shipping", "sale", "gift",
  "suitable", "compatible", "applicable", "universal", "multi", "multifunctional", "multifunction", "type",
  "pcs", "pc", "piece", "pieces", "set", "sets", "lot", "pack", "size", "color", "colors", "colour", "colours",
  "inch", "cm", "mm", "ml", "kg", "mah", "hz", "gb", "tb", "plus", "pro", "max", "mini", "large", "small", "big",
  "casual", "personality", "temperament", "korean", "european", "american", "japanese", "ins", "niche", "design",
  "sense", "trend", "versatile", "ladies", "lady", "unisex", "adult", "female", "male", "girls", "boys",
]);
// Whom a thing is for: never the last word, unless after "for".
const AUDIENCE = new Set(["women", "men", "girl", "boy", "kids", "baby", "child", "unisex", "pet", "dog", "cat"]);
// Allowed in a completion's middle: "case for iphone", "bag with wheels".
const MIDDLE_OK = new Set(["for", "with", "and"]);

const prisma = new PrismaClient();
try {
  const t0 = Date.now();
  const cats = await prisma.$queryRawUnsafe(`SELECT c."name" FROM "Category" c`);

  // Things: the head nouns of every category name, and the nouns products
  // are most often named with.
  const things = new Set();
  // CJ named some leaves with an adjective ("Solid", "Print", "Striped",
  // "Outdoor"): those are not things, and a phrase ending on one is a
  // fragment ("women solid").
  const NOT_THINGS = new Set(["solid", "print", "striped", "geometric", "3d", "outdoor", "indoor", "casual", "interior", "exterior",
    "other", "various", "seasonal", "functional", "creative", "electronic", "digital", "dual", "single", "fine", "real", "basic",
    "genuine", "synthetic", "human", "custom", "wool", "blend", "leather", "suede", "lovers", "pre", "colored", "salon"]);
  for (const c of cats) for (const h of categoryHeads(c.name)) if (!NOT_THINGS.has(h)) things.add(h);
  for (const w of [
    "holder", "stand", "mount", "strip", "lamp", "bulb", "cable", "charger", "adapter", "cover", "case", "bag", "box", "mat",
    "pillow", "cushion", "curtain", "towel", "sticker", "bottle", "cup", "mug", "organizer", "rack", "hook", "brush", "comb", "clip",
    "light", "speaker", "earbuds", "headphones", "keyboard", "mouse", "camera", "tripod", "lens", "watch", "band", "strap",
    "wallet", "purse", "backpack", "shoe", "sneakers", "sandal", "slippers", "boot", "sock", "glove", "hat", "cap", "scarf",
    "dress", "skirt", "shirt", "tshirt", "pants", "jeans", "shorts", "jacket", "coat", "hoodies", "sweater", "vest", "bra", "bikini",
    "necklace", "earring", "ring", "bracelet", "pendant", "brooch", "toy", "doll", "puzzle", "block", "car", "drone", "tent", "chair",
    "table", "shelf", "fan", "heater", "humidifier", "diffuser", "kettle", "knife", "pan", "pot", "plate", "bowl", "spoon", "set",
    "suit", "sleeve", "blouse", "top", "leggings", "pajamas", "costume", "wig", "jersey", "helmet", "glasses", "sunglasses",
  ]) things.add(stem(w));

  const rows = await prisma.$queryRawUnsafe(`SELECT p."name" FROM "Product" p TABLESAMPLE SYSTEM (${SAMPLE_PERCENT})`);
  const wordCount = new Map();
  const phraseCount = new Map();
  for (const { name } of rows) {
    const tokens = nameWords(name).filter((w) => !/\d/.test(w) && w.length >= 2);
    for (const w of new Set(tokens)) wordCount.set(w, (wordCount.get(w) ?? 0) + 1);
    const seen = new Set();
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= tokens.length; i++) {
        const g = tokens.slice(i, i + n);
        const last = g[n - 1];
        if (EDGE_STOP.has(g[0]) || EDGE_STOP.has(last) || MIDDLE_OK.has(g[0])) continue;
        if (g.slice(1, -1).some((w) => EDGE_STOP.has(w) && !MIDDLE_OK.has(w))) continue;
        if (AUDIENCE.has(last) ? g[n - 2] !== "for" : !things.has(stem(last))) continue;
        if (n === 4 && !g.slice(1, -1).some((w) => MIDDLE_OK.has(w))) continue; // four words only as "x y for z"
        if (new Set(g).size < n) continue;
        const key = g.join(" ");
        if (seen.has(key)) continue;
        seen.add(key);
        phraseCount.set(key, (phraseCount.get(key) ?? 0) + 1);
      }
    }
  }
  const scale = 100 / SAMPLE_PERCENT;
  const words = [...wordCount.entries()]
    .filter(([w, n]) => n >= 6 && /^[a-z]+$/.test(w) && w.length >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_WORDS)
    .map(([w]) => w);
  const phrases = [...phraseCount.entries()]
    .filter(([, n]) => n >= MIN_NAMES)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PHRASES)
    .map(([p, n]) => [p, Math.round(n * scale)]);

  fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), names: Math.round(rows.length * scale), words, phrases }) + "\n");
  console.log(`${rows.length} names sampled; ${words.length} words, ${phrases.length} phrases → src/lib/searchLexicon.json in ${Date.now() - t0} ms`);
} finally {
  await prisma.$disconnect();
}
