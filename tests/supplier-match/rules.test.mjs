// The supplier matcher's rules (src/lib/server/supplier-match), without a database: how a PRODUCTS cell becomes
// terms, the broad list, synonyms, exclusions, and the scoring, with a stand-in for Postgres's word matching.
// Real suppliers and real stemming: inquiries.test.mjs.
//   npm run test:supplier-match
import { test } from "node:test";
import assert from "node:assert/strict";
import { termsOf } from "../../src/lib/server/supplier-match/normalize.ts";
import { isBroadTerm } from "../../src/lib/server/supplier-match/broad.ts";
import { variantsOf } from "../../src/lib/server/supplier-match/synonyms.ts";
import { withoutExcludedWords } from "../../src/lib/server/supplier-match/exclusions.ts";
import { loadIndex, matchInquiry, searchWordOf, supplierDisplayName } from "../../src/lib/server/supplier-match/match.ts";

test("a PRODUCTS cell becomes terms the way the analysis read it", () => {
  assert.deepEqual(termsOf("Silicone baby tableware set"), ["silicone baby tableware"]);
  assert.deepEqual(termsOf("Juicer and clothes dryer"), ["juicer", "clothes dryer"]);
  assert.deepEqual(termsOf("STEEL BOWL WITH SILICONE BOTTOM AND LID"), ["steel bowl"]);
  assert.deepEqual(termsOf("LADIES & KIDS WATCH"), ["lady watch", "kid watch"]);
  assert.deepEqual(termsOf("Baby products (Baby bed rail guard)"), ["baby", "baby bed rail guard"]);
  assert.deepEqual(termsOf("t:Water bottle"), ["water bottle"]);
  assert.deepEqual(termsOf("3PCS SET TROLLEY BAG"), ["trolley bag"]);
  assert.deepEqual(
    termsOf("ceramic basin，toilet，wudu basin，faucet，shower and related bathroom product"),
    ["ceramic basin", "toilet", "wudu basin", "faucet", "shower", "bathroom"],
  );
  assert.deepEqual(termsOf(""), []);
  assert.deepEqual(termsOf(null), []);
});

test("the sheet's misspellings are fixed when the book is read", () => {
  assert.deepEqual(termsOf("MATRESS CLIPS"), ["mattress clip"]);
  assert.deepEqual(termsOf("NECKLESS,CHAIN"), ["necklace", "chain"]);
  assert.deepEqual(termsOf("BADMINDON RACKET"), ["badminton racket"]);
  assert.deepEqual(termsOf("SOLAR SREET LIGHT"), ["solar street light"]);
  assert.deepEqual(termsOf("CAT LITERS"), ["cat litter"]);
  assert.deepEqual(termsOf("SHUTTLE CORK"), ["shuttlecock"]);
  assert.deepEqual(termsOf("Cermic Toilet and Washbasin"), ["ceramic toilet", "washbasin"]);
  assert.deepEqual(termsOf("FUNITURE"), ["furniture"]);
});

test("broad entries are the report's: a material, a use or a part", () => {
  for (const t of ["corporate gift", "hotel amenity", "baby", "led light", "car part", "silicone"]) assert.ok(isBroadTerm(t), t);
  for (const t of ["carpet", "umbrella", "silicone baby tableware", "tent", "earring"]) assert.ok(!isBroadTerm(t), t);
});

test("synonyms: one phrase swapped at a time; tiffin box no longer means any food container", () => {
  assert.deepEqual(variantsOf("tiffin box"), ["tiffin box", "lunch box", "bento box"]);
  assert.ok(variantsOf("silicone baby tableware").includes("silicone baby plate"));
  assert.ok(variantsOf("football").includes("soccer"));
  assert.deepEqual(variantsOf("decanter"), ["decanter"]);
});

test("exclusions take the word out of the title only when the phrase is there", () => {
  const cap = withoutExcludedWords("Baby Shower Cap Protector");
  assert.deepEqual(cap.excluded, ["shower"]);
  assert.doesNotMatch(cap.title, /shower/i);
  assert.doesNotMatch(withoutExcludedWords("3 In1 LED Tent Lamp Car Night Light").title, /\btent\b/i);
  assert.doesNotMatch(withoutExcludedWords("Folding table on bed-Light gray").title, /\bbed\b/i);
  assert.doesNotMatch(withoutExcludedWords("Light Food Salad Takeout Packing Box Disposable Lunch").title, /lunch/i);
  // No phrase, no change.
  assert.deepEqual(withoutExcludedWords("Rain Shower Head 10 Inch"), { title: "Rain Shower Head 10 Inch", excluded: [] });
  assert.deepEqual(withoutExcludedWords("Camping Tent 4 Person").excluded, []);
});

test("the display name falls back from company to contact person to the supplier's number", () => {
  assert.equal(supplierDisplayName("Alpha Tableware Co., Ltd.", "Amy", 3), "Alpha Tableware Co., Ltd.");
  assert.equal(supplierDisplayName("", "Amy Chen", 12), "Amy Chen");
  assert.equal(supplierDisplayName(null, "  ", 491), "Supplier #491");
});

test("the search word when nothing matches: a word the book uses, the most repeated, else the last", () => {
  assert.equal(searchWordOf("Steak Plate, Round Flat Plate, Western Food Plate", new Set(["plate"])), "plate");
  assert.equal(searchWordOf("Decanter", new Set()), "decanter");
  assert.equal(searchWordOf("Spiralizer 3-Blade Vegetable Slicer", new Set()), "slicer");
  assert.equal(searchWordOf("62.99 inch Modern Design Console Table with Roman-style Legs", new Set()), "table");
  assert.equal(searchWordOf("", new Set()), "");
});

// ---- scoring, with a stand-in for Postgres ---------------------------------------------------------------------
// The stand-in "stems" crudely but consistently (clothes and clothings both "cloth", earrings and earring both
// "earr", boxes and box both "box"), and answers the statements the matcher sends.
const stem = (w) => (w.length > 3 ? w.replace(/s$/, "").replace(/(ing|e)$/, "") : w);
const words = (s) => (s || "").toLowerCase().split(/[^a-z0-9-]+/).filter((w) => w && !["and", "the", "of", "&"].includes(w)).map(stem);
const within = (needle, hay) => needle.length > 0 && needle.every((w) => hay.includes(w));

const SUPPLIERS = [
  [1, "Alpha Earrings Co", "Ms A", "EARRINGS"],
  [2, "Bravo Baby", "", "BABY PRODUCTS"],
  [3, "Carpet King", "", "Carpet"],
  [4, "", "Mr Delta", "ceramic basin，toilet，shower"],
  [5, "", "", "UMBRELLA"],
  [6, "Echo Garments", "", "CLOTHES"],
  [7, "Foxtrot Homewares", "", "TIFFIN BOX"],
  [8, "Golf Storage", "", "HOME OFFICE STORAGE"],
  [9, "Hotel Packaging", "", "garbage bag, t-shirt bag"],
];

const fakeQuery = async (sql, params) => {
  if (sql.includes('FROM "Supplier"')) {
    return SUPPLIERS.map(([id, companyName, personName, productsRaw]) => ({ id, sourceRow: id, serial: id, companyName, personName, productsRaw, address: null, contactRaw: null }));
  }
  if (sql.includes("numnode(plainto_tsquery('english', t))::int AS n")) {
    return params[0].map((t) => ({ t, n: Math.max(0, words(t).length * 2 - 1) }));
  }
  if (sql.includes("in_title")) {
    const [title, path, ownName, texts] = params;
    const titleWords = words(title);
    const pathWords = words(path);
    const ownWords = words(ownName);
    return texts
      .map((text) => {
        const t = words(text);
        const inPath = path !== "" && within(t, pathWords);
        const inName = path !== "" && ((ownWords.length >= 2 && within(ownWords, t)) || within(pathWords, t));
        return { text, in_title: within(t, titleWords), in_path: inPath, in_name: inName };
      })
      .filter((r) => r.in_title || r.in_path || r.in_name);
  }
  throw new Error(`unexpected statement: ${sql.slice(0, 60)}`);
};

const EARRINGS = { id: "cat-earrings", name: "Earrings", parentName: "Fashion Jewelry" };
const BABY_JEWELRY = { id: "cat-baby-jewelry", name: "Baby Jewelry", parentName: "Fashion Jewelry" };
const PET_CLOTHES = { id: "cat-pet", name: "Pet Clothings", parentName: "Pet Apparels" };
const CATCH_ALL = { id: "87CF251F-8D11-4DE0-A154-9694D9858EB3", name: "Home Office Storage", parentName: "Home Storage" };
const CLEAN = new Set(["cat-earrings", "cat-pet", CATCH_ALL.id]);

const index = await loadIndex(fakeQuery);
const run = (title, category = null, clean = CLEAN) => matchInquiry(index, { title, category }, clean, fakeQuery);

test("a specific match ranks above a broad one, and the broad one is flagged", async () => {
  // Both score 3: "earring" by its word; "baby", a broad term, by its word (1) and the category's agreeing (2).
  const r = await run("Baby Earrings Set Gift", BABY_JEWELRY);
  assert.deepEqual(r.matches.map((m) => m.supplierId), [1, 2]);
  assert.equal(r.matches[0].vague, false);
  assert.equal(r.matches[1].vague, true);
  assert.equal(r.matches[1].matchedCategory, "Fashion Jewelry > Baby Jewelry");
  // A broad term's word alone is not enough.
  assert.deepEqual((await run("Baby Earrings Set Gift")).matches.map((m) => m.supplierId), [1]);
});

test("a clean category is enough on its own; any other category is not", async () => {
  const clean = await run("Autumn And Winter New Green Love Acrylic Sheet", EARRINGS);
  assert.deepEqual(clean.matches.map((m) => m.supplierId), [1]);
  assert.deepEqual(clean.matches[0].matchedWords, []);
  assert.equal(clean.matches[0].matchedCategory, "Fashion Jewelry > Earrings");
  const notClean = await run("Autumn And Winter New Green Love Acrylic Sheet", EARRINGS, new Set());
  assert.deepEqual(notClean.matches, []);
});

test("a category whose name is only within a supplier's entry never matches alone: a t-shirt bag is a carrier bag", async () => {
  const TEES = { id: "cat-tees", name: "T-Shirts", parentName: "Men's Clothing" };
  const r = await run("Men's Contrast Button Down Hollow Out Shirt", TEES, new Set(["cat-tees"]));
  assert.ok(!r.matches.some((m) => m.supplierId === 9), JSON.stringify(r.matches));
});

test("a catch-all category never counts, even when a supplier's entry names it", async () => {
  const r = await run("Decorative Item", CATCH_ALL);
  assert.deepEqual(r.matches, []);
});

test("a pet category does not reach a supplier of people's clothes", async () => {
  const r = await run("Warm Fleece Jacket", PET_CLOTHES);
  assert.ok(!r.matches.some((m) => m.supplierId === 6));
});

test("an excluded phrase stops the word matching: a baby shower cap is not a shower", async () => {
  const r = await run("Baby Shower Cap Protector");
  assert.ok(!r.matches.some((m) => m.supplierId === 4));
  assert.deepEqual(r.excluded, ["shower"]);
  const shower = await run("Rain Shower Head");
  assert.deepEqual(shower.matches.map((m) => m.supplierId), [4]);
  assert.deepEqual(shower.matches[0].matchedWords, ["shower"]);
});

test("a synonym matches and says so; a takeout lunch box does not reach the tiffin maker", async () => {
  const lunch = await run("Stainless Lunch Box 3 Layers");
  assert.deepEqual(lunch.matches.map((m) => m.supplierId), [7]);
  assert.equal(lunch.matches[0].synonym, true);
  assert.equal(lunch.matches[0].term, "tiffin box");
  assert.deepEqual(lunch.matches[0].matchedWords, ["lunch", "box"]);
  const takeout = await run("Light Food Salad Fried Rice Takeout Packing Box Disposable Lunch");
  assert.ok(!takeout.matches.some((m) => m.supplierId === 7));
});

test("nothing matching is an empty list, not an error", async () => {
  const r = await run("Decanter");
  assert.deepEqual(r.matches, []);
  assert.equal(r.total, 0);
  assert.equal(r.searchWord, "decanter");
});
