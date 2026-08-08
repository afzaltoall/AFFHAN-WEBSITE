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
];

export function isNameBlocked(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return BLOCKED_NAME_KEYWORDS.some((k) => n.includes(k));
}

// Postgres POSIX regex (case-insensitive) matching any blocked name keyword on
// a word boundary — for use with the `!~*` (not-match) operator in SQL.
export function blockedNameRegex(): string {
  return `\\y(${BLOCKED_NAME_KEYWORDS.map((k) => k.replace(/[-\s]/g, "[- ]?")).join("|")})\\y`;
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
