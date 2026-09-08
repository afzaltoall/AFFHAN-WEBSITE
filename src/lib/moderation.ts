// ---------------------------------------------------------------------------
// Category-level content moderation.
//
// The sync already keyword-filters explicit product NAMES (see
// src/app/api/cron/sync/route.ts). But some categories are dominated by
// suggestive IMAGERY even when the product name is innocuous ("Denim shorts").
// For a B2B sourcing site those whole categories are hidden from customers.
//
// This is the single source of truth. It is applied at the API layer so the
// products stay in the DB (nothing is destroyed) but never appear in the
// catalog, category tree, mega-menu, rankings, search, or facets. To also
// physically move existing rows into ModerationLog, run
// scripts/moderate_categories.mjs.
// ---------------------------------------------------------------------------

// Lowercased substrings — a category is blocked if its name contains any.
export const BLOCKED_CATEGORY_PATTERNS = [
  "woman shorts",
  "women shorts",
  "women's shorts",
  "legging",
  "pants & capris",
  "pants and capris",
  "capris",
  "one-piece suit",
  "one piece suits",
  "bikini",
  "two-piece suit",
  "two piece suits",
  "blazers",
  "short-sleeved shirts",
  "short sleeved shirts",
  "underwear & loungewear", // whole subtree: boxers, briefs, sleep & lounge, etc.
  "underwear and loungewear",
  "pajama sets",
  "adult wellness",
  "adult product",
  // EPROLO names its adult category "Sex Product" and files it under two
  // different parents ("Beauty & Health" and, oddly, "Fashion & Clothing").
  // CJ's equivalents are the "adult …" names above, so nothing here matched it
  // and 165 products went live. Substring matching is what makes this safe to
  // state so plainly: "sex product" cannot match "Unisex Dresses" or the other
  // Unisex categories, which is why the pattern is the full phrase and never
  // the bare word.
  "sex product",
  "weddings & events", // whole subtree: evening/wedding/prom/cocktail/bridesmaid dresses
  "weddings and events",
  "belts & cummerbunds",
  "belts and cummerbunds",
  "cummerbund",
];

export function isCategoryBlocked(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return BLOCKED_CATEGORY_PATTERNS.some((p) => n.includes(p));
}

// Adult-swimwear/underwear keywords that slip into OTHER categories (e.g. a
// "Bikini … Swimsuit" mis-filed under "Blazers"). Products whose NAME contains
// one of these are hidden too. The sync already blocks bra/lingerie/camisole/
// corset by name; these fill the gaps. Kept deliberately narrow to avoid
// removing legitimate products.
// Deliberately narrow + unambiguous (e.g. "thong" is excluded because it also
// means thong sandals — legitimate footwear).
export const BLOCKED_NAME_KEYWORDS = [
  "bikini", "g-string", "gstring", "g string",
  // Adult / 18+ item signals (unambiguous — safe to hide anywhere).
  "crotchless", "open crotch", "open-crotch", "bodystocking", "erotic",
  "masturbation", "dildo", "fetish", "pasties", "sex toy", "sex doll",
  "adult product", "negligee",
  // Adult items CJ files into innocuous categories, where category-level
  // blocking cannot reach them. Both are full phrases for the same reason the
  // category patterns are: blockedNameRegex() wraps each in \y…\y word
  // boundaries, and "unisex" has no boundary before "sex", so neither can
  // touch the Unisex categories.
  //
  // "sex product" is also what catches the one whose title reads "Crystal
  // Transparent Airplane Bottle Men's Trainer Comfortable And Sex Product" —
  // the euphemism is in the phrasing, not in "airplane bottle", which is
  // otherwise two bottle openers, nor in "men's trainer", which is shoes.
  "sex product", "sex pose",

  // ---------------------------------------------------------------------
  // Added after adult items were found live under "Fashion & Clothing >
  // Others". Category-level blocking could not have caught them: "Others" is
  // a generic bucket whose name carries no signal, so the product name is the
  // only thing left to match on.
  //
  // Every term here survived a catalogue-wide triage against all 1,080,971
  // products. The ones that did NOT survive are worth recording, because they
  // look plausible and are not:
  //   "babydoll"      - a blouse/dress cut ("Babydoll Corduroy Shirt")
  //   "nipple pad"    - nursing pads, and an office-chair cushion
  //   "open cup"      - vacuum flasks and cupboards
  //   "garter belt"   - body-jewellery leg chains and bridal garters
  //   "exposed navel" - ordinary crop tops, 25 of them
  // Adding any of those would have hidden maternity and baby products.
  "nipple cover", "nipple sticker", "nipple clamp", "breast sticker", "breast petal",
  "sex pillow", "sex swing", "anal plug", "butt plug", "cock ring",
  "vibrator", "masturbator", "clitoris", "g-spot", "orgasm",
  "bdsm", "bondage", "aphrodisiac", "penis enlargement", "thong panties",
  "vaginal tightening", "vaginal repair", "cupless", "peephole bra",
  "sexy lingerie", "erotic lingerie", "open bust", "open-crotch panties",
];

export function isNameBlocked(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return BLOCKED_NAME_KEYWORDS.some((k) => n.includes(k));
}

// ---------------------------------------------------------------------------
// Individual products hidden by id.
//
// The third and last resort, after category name and product name. It exists
// because neither of those can catch a product whose problem is its PHOTOGRAPH.
// The item that prompted this is called "Suitable Boho Chiffon Womens Tops And
// Blouses Kimono" — an unremarkable name on an image of a model wearing nipple
// pasties. It sits in "Others", a generic bucket that also holds children's
// Star Wars costumes and Christian apparel, so blocking the category would take
// 112 mostly-innocent products with it.
//
// Keep this list short and cite each entry. A long list here means the keyword
// or category rules should have been extended instead.
// "bralette" is deliberately NOT a keyword: it appears in ordinary garments
// ("Knitted Bodycon Mini Dress with Built-in Bralette"), so it would hide 15
// products to catch two. Those two are listed here instead.
export const BLOCKED_PRODUCT_IDS: ReadonlySet<number> = new Set([
  // Reported live in Fashion & Clothing > Others. Model shown wearing nipple
  // pasties; the name carries no signal at all.
  1215583,
  // Same category, bra-styled midriff top. "open umbilical" was rejected as a
  // keyword because its other two matches are ordinary crop tops.
  1214176,
  // Same category, exposed-bust shapewear.
  1211917,
]);

export function isProductIdBlocked(id: number | null | undefined): boolean {
  return id != null && BLOCKED_PRODUCT_IDS.has(id);
}

// ---------------------------------------------------------------------------
// Review tier — suspicious enough to stop at the door, not certain enough to
// state as a fact about the catalogue.
//
// BLOCKED_NAME_KEYWORDS hides things that are already live. This list is used
// earlier, by the ingest gate: a product whose name matches is never written at
// all, so it cannot be visible even briefly while someone looks at it.
//
// Kept deliberately tight, and deliberately WITHOUT the terms reviewed and
// cleared on 2026-09-08: "garter belt" (bridal and body jewellery), "vaginal
// repair" (health and wellness), and "navel"/"umbilical" (ordinary crop tops).
// Those were judged legitimate, and a review gate that keeps stopping known-good
// products is one people learn to skip past.
// Three more were tried and dropped, for the same reason the blocklist rejects
// "babydoll": they read as adult but are not.
//   "lace teddy" - "Lace Teddy Bear Dog Leash", a pet bed
//   "pole dance" - a transparent acrylic wall clock
//   "boudoir"    - a titanium bracelet
export const REVIEW_NAME_TERMS = [
  "sexy underwear", "sexy bra set", "erotic lingerie", "temptation lingerie",
  "transparent lingerie", "see through lingerie", "sheer lingerie",
  "teddy lingerie", "nipple tassel", "strip tease",
  "fishnet bodysuit", "exposed bust", "bust exposed", "open back bra",
];

export function needsReview(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return REVIEW_NAME_TERMS.some((k) => n.includes(k));
}

/// Category names that carry no signal about what is filed under them.
///
/// These are where the "Fashion & Clothing > Others" items hid: a bucket whose
/// name moderation cannot read, holding children's costumes and lingerie side
/// by side. Products landing here are reported for human review rather than
/// blocked — the bucket held 112 products and most were innocuous, so blocking
/// it wholesale would be worse than the problem.
export const GENERIC_CATEGORY_NAMES = [
  "other", "others", "misc", "miscellaneous", "general",
  "uncategorized", "uncategorised",
];

export function isGenericBucket(name: string | null | undefined): boolean {
  if (!name) return false;
  return GENERIC_CATEGORY_NAMES.includes(name.trim().toLowerCase());
}

/// The ids as a SQL-safe list for `p."id" NOT IN (...)`. Returns null when the
/// set is empty so callers can skip the clause entirely.
export function blockedProductIdList(): number[] | null {
  return BLOCKED_PRODUCT_IDS.size ? [...BLOCKED_PRODUCT_IDS] : null;
}

// Postgres POSIX regex (case-insensitive) matching any blocked name keyword on
// a word boundary — for use with the `!~*` (not-match) operator in SQL.
export function blockedNameRegex(): string {
  // The trailing `(?:e?s)?` matters more than it looks. With a bare \y on the
  // end, "sex toy" did not match "Sex Toys" — the plural's trailing "s" is a
  // word character, so the boundary never lands. That single gap left six
  // "Sex Pillow Couples Sex Toys" products visible in Furniture while the
  // keyword that should have caught them was already on the list.
  return `\\y(${BLOCKED_NAME_KEYWORDS.map((k) => k.replace(/[-\s]/g, "[- ]?")).join("|")})(?:e?s)?\\y`;
}

// From a list of categories, the ids whose name is blocked.
export function blockedCategoryIds<T extends { id: string; name: string }>(categories: T[]): string[] {
  return categories.filter((c) => isCategoryBlocked(c.name)).map((c) => c.id);
}

// Descendant-aware blocking: a category is blocked if its own name matches OR
// any ancestor's name matches. Products attach only to leaf categories, so
// blocking a parent (e.g. "Underwear & Loungewear") must also hide every leaf
// beneath it. Returns the full set of blocked ids (parents + all descendants).
export function blockedCategoryIdSet<T extends { id: string; name: string; parentId: string | null }>(categories: T[]): Set<string> {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const memo = new Map<string, boolean>();
  const isBlockedDeep = (id: string, seen: Set<string> = new Set()): boolean => {
    if (memo.has(id)) return memo.get(id)!;
    if (seen.has(id)) return false; // cycle guard
    seen.add(id);
    const c = byId.get(id);
    if (!c) return false;
    const blocked = isCategoryBlocked(c.name) || (c.parentId ? isBlockedDeep(c.parentId, seen) : false);
    memo.set(id, blocked);
    return blocked;
  };
  const set = new Set<string>();
  for (const c of categories) if (isBlockedDeep(c.id)) set.add(c.id);
  return set;
}
