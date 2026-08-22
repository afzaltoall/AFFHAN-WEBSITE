import { Prisma } from ".prisma/client";

// ---------------------------------------------------------------------------
// Unified search core.
//
// One place that turns a raw human query into SQL, so the homepage hero, the
// navbar autocomplete and the /products results grid all rank the same way and
// can never disagree again.
//
// PERFORMANCE — the WHERE/relevance fragments reference ONLY the Product table
// (alias `p`). They never touch the joined Category table. This is deliberate:
// putting `OR c."name" ILIKE …` in the WHERE (with a JOIN) stopped Postgres
// using the FTS GIN index and forced a full to_tsvector scan of all 600k rows
// — a flat ~3s per search regardless of how many rows matched. Instead the
// caller resolves which CATEGORIES match the text (Category is tiny, 600ish
// rows, matched in memory) and passes their ids in as `categoryIds`; matching
// then becomes `FTS(name) OR p."categoryId" IN (…)`, two index scans on one
// table that the planner BitmapOr's in ~300ms.
//
// MATCHING:
//   • PRODUCT NAME → full-text search on to_tsvector('english', name), backed
//     by the GIN index `product_name_fts_idx` (scripts/create_search_index.mjs).
//     Index-accelerated AND stemmed, so "dresses"→"dress", "cables"→"cable".
//     All words AND-ed; while typing, the last word is a prefix ("cabl:*").
//   • CATEGORY → categoryIds the caller resolved from the same query.
//   • A product matches if EITHER side matches.
//   • Relevance = ts_rank on the name + exact/prefix/phrase/category boosts.
// ---------------------------------------------------------------------------

export interface ParsedQuery {
  raw: string;
  phrase: string; // normalized full string, e.g. "women bags"
  tokens: string[]; // meaningful words, e.g. ["women","bags"]
  tsTokens: string[]; // alphanumeric-only tokens safe for to_tsquery
  isValid: boolean;
}

// Words that add noise, not intent. Dropped from matching but kept in `phrase`.
const STOP_WORDS = new Set([
  "the", "a", "an", "for", "and", "or", "of", "to", "with", "in", "on",
  "my", "your", "some", "any", "please", "want", "need", "looking", "buy",
  "me", "i", "we", "is", "are", "that", "this",
]);

// Escapes LIKE/ILIKE wildcards so user text is matched literally. Postgres'
// default LIKE escape character is backslash.
export function escapeLike(str: string): string {
  return str.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export function parseQuery(raw: string | null | undefined): ParsedQuery {
  const cleaned = (raw ?? "").trim().replace(/\s+/g, " ");
  const lower = cleaned.toLowerCase();
  const allWords = lower.length ? lower.split(" ") : [];
  const meaningful = allWords.filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  const tokens = (meaningful.length ? meaningful : allWords).slice(0, 6);
  // Strip anything that isn't a letter/number so the string is always a legal
  // to_tsquery input (`&`, `:` etc. would otherwise throw).
  const tsTokens = tokens
    .map((t) => t.replace(/[^a-z0-9]/gi, ""))
    .filter((t) => t.length >= 1);
  return {
    raw: cleaned,
    phrase: lower,
    tokens,
    tsTokens,
    isValid: cleaned.length >= 1,
  };
}

// True if a category NAME matches the query (every word appears). Used by the
// caller to resolve matching category ids in memory from the (small) category
// list, so the SQL never has to join Category.
export function categoryNameMatches(name: string, pq: ParsedQuery): boolean {
  if (!pq.tokens.length) return false;
  const n = name.toLowerCase();
  return pq.tokens.every((tok) => n.includes(tok));
}

// Synonym expansion — the biggest accuracy win after stemming. A shopper who
// types "mobile" should get "phone" results, "tv" should get "television",
// etc. Each entry lists equivalent terms; a matched token is OR-ed with its
// synonyms inside the tsquery. Bidirectional pairs are listed both ways.
const SYNONYMS: Record<string, string[]> = {
  mobile: ["phone", "smartphone", "cellphone"],
  phone: ["mobile", "smartphone", "cellphone"],
  cellphone: ["phone", "mobile", "smartphone"],
  smartphone: ["phone", "mobile"],
  tv: ["television"],
  television: ["tv"],
  laptop: ["notebook"],
  notebook: ["laptop"],
  fridge: ["refrigerator"],
  refrigerator: ["fridge"],
  sneaker: ["shoe", "trainer"],
  sneakers: ["shoes", "trainers"],
  trainer: ["sneaker", "shoe"],
  earbud: ["earphone", "headphone"],
  earbuds: ["earphones", "headphones"],
  earphone: ["earbud", "headphone"],
  headphone: ["earphone", "earbud"],
  specs: ["glasses", "spectacles", "eyeglasses"],
  spectacles: ["glasses", "specs"],
  glasses: ["spectacles", "eyeglasses"],
  purse: ["wallet", "handbag"],
  handbag: ["purse", "bag"],
  jumper: ["sweater", "pullover"],
  sweater: ["jumper", "pullover"],
  trousers: ["pants"],
  pants: ["trousers"],
  sofa: ["couch"],
  couch: ["sofa"],
  bottle: ["flask"],
  cooker: ["stove"],
  torch: ["flashlight"],
  flashlight: ["torch"],
};

// A single tsquery term for one word: the word (prefix in prefix-mode) OR any
// of its synonyms, e.g. "(mobile | phone | smartphone)".
function termForToken(token: string, prefix: boolean): string {
  const syns = SYNONYMS[token] ?? [];
  const self = prefix ? `${token}:*` : token;
  if (syns.length === 0) return self;
  return `(${[self, ...syns].join(" | ")})`;
}

// Builds the tsquery string, e.g. "(women) & (red) & (dress:*)". In prefix mode
// the last word becomes a prefix match for live autocomplete.
function tsQueryString(pq: ParsedQuery, prefix: boolean): string {
  if (pq.tsTokens.length === 0) return "";
  const parts = pq.tsTokens.map((t, i) =>
    termForToken(t, prefix && i === pq.tsTokens.length - 1)
  );
  return parts.join(" & ");
}

// Fuzzy (typo-tolerant) fallback pieces, used ONLY when an exact search returns
// nothing — so "iphn" still finds "iPhone". Backed by the pg_trgm GIN index via
// the `%` operator; ordered by trigram similarity. Assumes alias `p`.
export function buildFuzzyWhere(pq: ParsedQuery): Prisma.Sql {
  return Prisma.sql`p."name" % ${pq.phrase}`;
}
export function buildFuzzyOrderBy(pq: ParsedQuery): Prisma.Sql {
  return Prisma.sql`similarity(p."name", ${pq.phrase}) DESC, p."id" DESC`;
}

interface SearchOpts {
  prefix?: boolean; // autocomplete: treat the last word as a prefix
  categoryIds?: string[]; // categories whose name matched the query
}

// WHERE fragment. References ONLY Product `p`. Returns Prisma.empty for an
// empty query.
export function buildSearchWhere(pq: ParsedQuery, opts: SearchOpts = {}): Prisma.Sql {
  if (!pq.isValid) return Prisma.empty;

  const clauses: Prisma.Sql[] = [];

  const tsq = tsQueryString(pq, opts.prefix ?? false);
  if (tsq) {
    clauses.push(
      Prisma.sql`to_tsvector('english', p."name") @@ to_tsquery('english', ${tsq})`
    );
  }

  if (opts.categoryIds && opts.categoryIds.length > 0) {
    clauses.push(Prisma.sql`p."categoryId" IN (${Prisma.join(opts.categoryIds)})`);
  }

  if (clauses.length === 0) {
    // Degenerate query (e.g. only symbols) — fall back to a literal contains.
    return Prisma.sql`p."name" ILIKE ${`%${escapeLike(pq.phrase)}%`}`;
  }
  return Prisma.sql`(${Prisma.join(clauses, " OR ")})`;
}

// Numeric relevance score for ORDER BY. References ONLY Product `p`.
export function buildRelevanceExpr(pq: ParsedQuery, opts: SearchOpts = {}): Prisma.Sql {
  if (!pq.isValid) return Prisma.sql`0`;

  const phrase = pq.phrase;
  const prefixLike = `${escapeLike(phrase)}%`;
  const containsLike = `%${escapeLike(phrase)}%`;
  const tsq = tsQueryString(pq, opts.prefix ?? false);

  const parts: Prisma.Sql[] = [
    Prisma.sql`(CASE WHEN lower(p."name") = ${phrase} THEN 1000 ELSE 0 END)`,
    Prisma.sql`(CASE WHEN p."name" ILIKE ${prefixLike} THEN 300 ELSE 0 END)`,
    Prisma.sql`(CASE WHEN p."name" ILIKE ${containsLike} THEN 150 ELSE 0 END)`,
  ];

  if (opts.categoryIds && opts.categoryIds.length > 0) {
    parts.push(
      Prisma.sql`(CASE WHEN p."categoryId" IN (${Prisma.join(opts.categoryIds)}) THEN 130 ELSE 0 END)`
    );
  }

  if (tsq) {
    parts.push(
      Prisma.sql`(ts_rank(to_tsvector('english', p."name"), to_tsquery('english', ${tsq})) * 120)`
    );
  }

  return Prisma.sql`(${Prisma.join(parts, " + ")})`;
}

// ORDER BY fragment: relevance first (when searching), then a stable tiebreak.
export function buildSearchOrderBy(pq: ParsedQuery, secondary: Prisma.Sql, opts: SearchOpts = {}): Prisma.Sql {
  if (!pq.isValid) return secondary;
  return Prisma.sql`${buildRelevanceExpr(pq, opts)} DESC, ${secondary}`;
}
