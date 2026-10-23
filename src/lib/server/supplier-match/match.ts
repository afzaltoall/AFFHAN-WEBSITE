import "server-only";
import { isBroadTerm } from "./broad";
import { CATCH_ALL_CATEGORY_IDS, GENERIC_CATEGORY_NAME, PET_CATEGORY, PET_TERM, categoryPath, type InquiryCategory } from "./categories";
import { withoutExcludedWords } from "./exclusions";
import { NOISE, singular, termsOf } from "./normalize";
import { variantsOf } from "./synonyms";

/**
 * Which of the old suppliers (the WeChat book, `Supplier`) could source an inquired product: method C of the
 * coverage analysis (REPORT.md 3), "the title's words lead, a clean category may speak alone, synonyms on".
 *
 * Per supplier, its best term scores:
 *   words      3 when every word of the term is in the title, 2 when a synonym variant's are (synonyms.ts); one more
 *              for a term of two or more words; just 1 for a broad term (broad.ts), which matches by accident;
 *   category   2 when every word of the term is in the product's category with its parent's (categories.ts), 3 when
 *              that category is clean (clean-categories.json) and the term is not broad; only 1 when instead the
 *              category's own name is within the term ("T-Shirts" in "t-shirt bag"), so that never matches alone;
 *              nothing for a catch-all, nor for a pet category unless the term is for animals.
 * A supplier matches at 3 or more: its own words alone, a clean category alone, or two weaker signs together.
 * Specific matches rank above broad ones, then by score, then words in the title above the category alone.
 *
 * The words are matched by Postgres itself, in one statement per inquiry, with the same English stemming the
 * catalogue's search index uses ("dryers" finds "dryer"); nothing here touches a product table but to read the
 * inquired product's category. Database access is passed in (Query), so the same code runs on Prisma in the app
 * and on pg in the tests.
 */

/** One parameterised SQL statement and its rows. */
export type Query = <T>(sql: string, params: unknown[]) => Promise<T[]>;

/** The columns of `Supplier` the matcher and the console need. Contact details are read, never logged. */
export interface SupplierRow {
  id: number;
  sourceRow: number;
  serial: number | null;
  personName: string | null;
  companyName: string | null;
  productsRaw: string | null;
  address: string | null;
  contactRaw: string | null;
}

interface Term {
  text: string;
  /** Lexemes after Postgres's stemming; 0 means only stop words, and the term is dropped. */
  words: number;
  broad: boolean;
  suppliers: number[];
  variants: string[];
}

export interface MatchIndex {
  rows: Map<number, SupplierRow>;
  terms: Map<string, Term>;
  /** Every term and synonym variant, once: the array the one statement matches. */
  texts: string[];
}

/** The suppliers and their terms, read once (02-suppliers.mjs and 04-match.mjs of the analysis). */
export async function loadIndex(query: Query): Promise<MatchIndex> {
  const rows = await query<SupplierRow>(
    `SELECT id, "sourceRow", serial, "personName", "companyName", "productsRaw", address, "contactRaw" FROM "Supplier" ORDER BY id`,
    [],
  );
  const bySupplier = new Map<number, SupplierRow>();
  const termSuppliers = new Map<string, number[]>();
  for (const row of rows) {
    bySupplier.set(row.id, row);
    for (const term of termsOf(row.productsRaw)) {
      if (!termSuppliers.has(term)) termSuppliers.set(term, []);
      termSuppliers.get(term)!.push(row.id);
    }
  }
  const variants = new Map([...termSuppliers.keys()].map((t) => [t, variantsOf(t)]));
  const all = [...new Set([...variants.values()].flat())];
  // How many lexemes each text has once stemmed: a term of stop words alone ("other") can never match.
  const sizes = await query<{ t: string; n: number }>(
    `SELECT t, numnode(plainto_tsquery('english', t))::int AS n FROM unnest($1::text[]) AS t`,
    [all],
  );
  const lexemes = new Map(sizes.map((r) => [r.t, (Number(r.n) + 1) / 2]));
  const terms = new Map<string, Term>();
  for (const [text, suppliers] of termSuppliers) {
    const words = Math.floor(lexemes.get(text) ?? 0);
    if (!words) continue;
    terms.set(text, {
      text,
      words,
      broad: isBroadTerm(text),
      suppliers,
      variants: variants.get(text)!.filter((v) => (lexemes.get(v) ?? 0) >= 1),
    });
  }
  const texts = [...new Set([...terms.values()].flatMap((t) => t.variants))];
  return { rows: bySupplier, terms, texts };
}

export type CategorySource = "linked product" | "same title" | null;

/**
 * The inquired product's category: the linked product's; when the link is gone (a product deleted since), the
 * category of a catalogue product with exactly the same title; otherwise none, and the match is by words only.
 * One statement, by primary key and the name index.
 */
export async function resolveInquiryCategory(
  query: Query,
  inquiry: { productId: number | null; productName: string },
): Promise<{ category: InquiryCategory | null; source: CategorySource }> {
  const rows = await query<{ id: string; name: string; parentName: string | null; linked: boolean }>(
    `SELECT c.id, c.name, c."parentName", (SELECT p."categoryId" FROM "Product" p WHERE p.id = $1::int) IS NOT NULL AS linked
     FROM "Category" c
     WHERE c.id = COALESCE(
       (SELECT p."categoryId" FROM "Product" p WHERE p.id = $1::int),
       (SELECT p."categoryId" FROM "Product" p WHERE (p.name = $2 OR p.name = btrim($2)) AND p."categoryId" IS NOT NULL LIMIT 1)
     )`,
    [inquiry.productId, inquiry.productName],
  );
  const r = rows[0];
  if (!r) return { category: null, source: null };
  return { category: { id: r.id, name: r.name, parentName: r.parentName }, source: r.linked ? "linked product" : "same title" };
}

/**
 * The one statement: for every term and variant, whether all its words are in the title (in_title); whether all
 * its words are in the category's name with its parent's (in_path, "bag" in "Men's Luggage & Bags > Briefcases");
 * and whether the category's own name is within the term (in_name, "Water Heaters" in "electric water heater").
 * $2 is the category with its parent's name, $3 the category's own name when it is specific. in_name only ever
 * supports a match: "T-Shirts" is within "t-shirt bag", which is a carrier bag.
 */
export const MATCH_SQL = `
SELECT text, in_title, in_path, in_name FROM (
  SELECT t AS text,
         to_tsvector('english', $1) @@ plainto_tsquery('english', t) AS in_title,
         ($2 <> '' AND to_tsvector('english', $2) @@ plainto_tsquery('english', t)) AS in_path,
         ($2 <> '' AND (
           ($3 <> '' AND numnode(plainto_tsquery('english', $3)) >= 3 AND to_tsvector('english', t) @@ plainto_tsquery('english', $3))
           OR to_tsvector('english', t) @@ plainto_tsquery('english', $2)
         )) AS in_name
  FROM unnest($4::text[]) AS t
) m
WHERE in_title OR in_path OR in_name`;

export interface SupplierMatch {
  supplierId: number;
  score: number;
  /** The supplier's matching entry is a broad term (a material, a use or a part): shown as a broad match. */
  vague: boolean;
  /** The supplier's own term that matched. */
  term: string;
  /** The words found in the title: the term itself, or the synonym standing in for it. */
  matchedWords: string[];
  synonym: boolean;
  /** "Parent > Category" when the category agreed with the term. */
  matchedCategory: string | null;
}

export interface MatchResult {
  matches: SupplierMatch[];
  /** Every supplier that matched, before the limit. */
  total: number;
  /** Words taken out of the title by exclusions.ts. */
  excluded: string[];
  /** A word to search the supplier book for: the title's likeliest product word. */
  searchWord: string;
}

interface Candidate extends SupplierMatch {
  words: number;
}

export async function matchInquiry(
  index: MatchIndex,
  input: { title: string; category: InquiryCategory | null },
  cleanCategoryIds: ReadonlySet<string>,
  query: Query,
  limit = 10,
): Promise<MatchResult> {
  const { title, excluded } = withoutExcludedWords(input.title);
  const category = input.category && !CATCH_ALL_CATEGORY_IDS.has(input.category.id) ? input.category : null;
  const path = category ? `${category.parentName ?? ""} ${category.name}`.trim() : "";
  const ownName = category && !GENERIC_CATEGORY_NAME.test(category.name.trim()) ? category.name : "";
  const rows = await query<{ text: string; in_title: boolean; in_path: boolean; in_name: boolean }>(MATCH_SQL, [title, path, ownName, index.texts]);

  const inTitle = new Set(rows.filter((r) => r.in_title).map((r) => r.text));
  const inPath = new Set(rows.filter((r) => r.in_path).map((r) => r.text));
  const inName = new Set(rows.filter((r) => r.in_name).map((r) => r.text));
  const clean = category ? cleanCategoryIds.has(category.id) : false;
  const petCategory = category ? PET_CATEGORY.test(categoryPath(category)) : false;

  const best = new Map<number, Candidate>();
  const byWords = (c: Candidate) => (c.matchedWords.length > 0 ? 1 : 0);
  const better = (a: Candidate, b: Candidate) =>
    a.score !== b.score ? a.score > b.score : a.vague !== b.vague ? !a.vague : byWords(a) !== byWords(b) ? byWords(a) > byWords(b) : a.words > b.words;

  for (const term of index.terms.values()) {
    let words = 0;
    let matched: string | null = null;
    if (inTitle.has(term.text)) {
      words = 3;
      matched = term.text;
    } else {
      matched = term.variants.find((v) => v !== term.text && inTitle.has(v)) ?? null;
      if (matched) words = 2;
    }
    const wordPoints = words ? (term.broad ? 1 : words + (term.words >= 2 ? 1 : 0)) : 0;
    const petBlocked = petCategory && !PET_TERM.test(term.text);
    const path = inPath.has(term.text) && !petBlocked;
    const named = !path && inName.has(term.text) && !petBlocked;
    const agrees = path || named;
    const categoryPoints = path ? (clean && !term.broad ? 3 : 2) : named ? 1 : 0;
    const score = wordPoints + categoryPoints;
    if (score < 3) continue;
    for (const supplierId of term.suppliers) {
      const candidate: Candidate = {
        supplierId,
        score,
        vague: term.broad,
        term: term.text,
        matchedWords: matched ? matched.split(" ") : [],
        synonym: words === 2,
        matchedCategory: agrees && category ? categoryPath(category) : null,
        words: term.words,
      };
      const held = best.get(supplierId);
      if (!held || better(candidate, held)) best.set(supplierId, candidate);
    }
  }

  // Specific before broad; then the score; then a match by the title's own words before one by the category alone;
  // then the longer term.
  const ranked = [...best.values()].sort(
    (a, b) => Number(a.vague) - Number(b.vague) || b.score - a.score || byWords(b) - byWords(a) || b.words - a.words || a.supplierId - b.supplierId,
  );
  return {
    matches: ranked.slice(0, limit).map((c) => ({
      supplierId: c.supplierId,
      score: c.score,
      vague: c.vague,
      term: c.term,
      matchedWords: c.matchedWords,
      synonym: c.synonym,
      matchedCategory: c.matchedCategory,
    })),
    total: ranked.length,
    excluded,
    // From the title as matched: an excluded word ("lunch" of a takeout box) would lead back to those suppliers.
    searchWord: searchWordOf(title),
  };
}

/** What the console calls a supplier: the company, else the contact person, else "Supplier #<id>". */
export function supplierDisplayName(company: string | null | undefined, person: string | null | undefined, id: number): string {
  return (company ?? "").trim() || (person ?? "").trim() || `Supplier #${id}`;
}

// Words a product title carries that never name the product: who it is for, sizes, seasons, selling words.
const TITLE_FLUFF = new Set([
  "women", "woman", "men", "man", "lady", "ladies", "girl", "boy", "kid", "children", "child", "baby", "unisex",
  "fashion", "style", "new", "hot", "sale", "simple", "cute", "creative", "multifunctional", "portable", "versatile",
  "intelligent", "quality", "high", "large", "big", "small", "mini", "ultra", "thick", "solid", "casual", "dual",
  "disposable", "summer", "winter", "spring", "autumn", "inch", "cm", "mm", "length", "mid", "total", "piece", "pcs",
  "pack", "set", "pair", "roll", "color", "colour", "design", "modern", "retro", "vintage", "korean",
]);

/**
 * The word to search the supplier book for when nothing matched: the inquired product's main word. Of the title's
 * content words before any "with ..." or "for ...", the one it repeats most (a catalogue title names its product
 * twice: "Dock Stand USB Charging Dock Station Stand"), else the last, which heads an English product name
 * ("Electric car helmet unisex" is a helmet). Shown in the link's text, so a poor pick is visible before the click.
 */
export function searchWordOf(title: string): string {
  const words = headWords(title);
  if (!words.length) return "";
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  // From the end, so a tie goes to the later word.
  let pick = words[words.length - 1];
  for (let i = words.length - 2; i >= 0; i--) if (counts.get(words[i])! > counts.get(pick)!) pick = words[i];
  return pick;
}

/**
 * A title's content words, once each: the words searchWordOf weighs, so "Portable Soccer Goal, 12x6 Ft Soccer Net,
 * ... With Carry Bag" is soccer, goal, net and the rest of its head, never the carry bag it comes with. The portal's
 * applications are matched to an inquiry by the words they share (portal-rank.ts).
 */
export function contentWordsOf(title: string): string[] {
  return [...new Set(headWords(title))];
}

/** The title before any "with ..." or "for ...", as content words in order, repeats kept. */
function headWords(title: string): string[] {
  const head = title.toLowerCase().split(/\b(?:with|for)\b/)[0];
  // Checked again once singular: "mens" is "men", "pcs" would be "pc".
  return head
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !NOISE.has(w) && !TITLE_FLUFF.has(w))
    .map(singular)
    .filter((w) => w.length >= 3 && !TITLE_FLUFF.has(w));
}
