import { Prisma } from ".prisma/client";
import { prisma } from "@/lib/prisma";
import { GET as getCategories } from "@/app/api/categories/route";
import { blockedCategoryIdSet, blockedNameRegex, blockedProductIdList, isNameBlocked, isProductIdBlocked } from "@/lib/moderation";
import { getCachedAllCategories } from "@/lib/products";
import lexicon from "@/lib/searchLexicon.json";
import {
  ACCESSORY_TERMS,
  accessoriesSink,
  buildCategoryIndex,
  buildVocabulary,
  correctWords,
  equivalents,
  isDescriptive,
  nameWords,
  resolveCategories,
  stem,
  understandQuery,
  type CategoryHit,
  type CategoryIndex,
  type CategoryIntent,
  type QueryIntent,
  type Vocabulary,
} from "@/lib/searchIntent";
import { buildCompleter, categoriesStartingWith, type Completer, type Lexicon } from "@/lib/searchComplete";

/**
 * The search, on the server: the same reading of a query the browser makes
 * (searchIntent, searchComplete), and the SQL it becomes. Used by the
 * suggestions endpoint (as a shopper types) and the products endpoint (the
 * results page), so the two can never disagree.
 *
 * Cost, measured on the live catalogue (1.08M products, 2026-10-06): the
 * old as-you-type query took 1.36s for "cars" alone, because "cars" was sent
 * as the prefix car:*, which matches 69,755 names ("card", "cardigan",
 * "carton"…) against 19,482 for the word, and every match was sorted. Now a
 * word the catalogue knows is matched as itself, a prefix only for a word
 * still being typed, and suggestions read a few rows per category through the
 * (categoryId, id DESC) index, or the first matches the text index hands back,
 * never a sort of every match.
 */

interface SearchCategory {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  thumbnailUrl: string | null;
  productCount: number;
}

interface Kit {
  at: number;
  index: CategoryIndex;
  vocab: Vocabulary;
  completer: Completer;
  byId: Map<string, SearchCategory>;
  /** Moderated categories (and their descendants): never in a result, however a name matches. */
  blocked: string[];
}

let kit: Kit | null = null;
let building: Promise<Kit> | null = null;
/** Rebuilt at most every ten minutes per server instance; the category API's own cache is an hour. */
const KIT_MS = 10 * 60_000;

/**
 * The category tree as search reads it, from the categories API's own cache
 * (unstable_cache, an hour; moderated categories already gone), so this
 * costs the database nothing of its own.
 */
export async function searchKit(): Promise<Kit> {
  if (kit && Date.now() - kit.at < KIT_MS) return kit;
  if (building) return building;
  building = (async () => {
    const [res, all] = await Promise.all([getCategories(), getCachedAllCategories()]);
    const json = (await res.json()) as { data?: SearchCategory[] };
    const rows = json.data ?? [];
    const index = buildCategoryIndex(rows.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, own: c.productCount ?? 0 })));
    const next: Kit = {
      at: Date.now(),
      index,
      vocab: buildVocabulary(lexicon.words, index.words),
      // JSON arrays type as (string | number)[]; the builder wrote [phrase, count] pairs.
      completer: buildCompleter(lexicon as unknown as Lexicon, index),
      byId: new Map(rows.map((c) => [c.id, c])),
      blocked: [...blockedCategoryIdSet(all)],
    };
    // An empty tree (the categories API failing) is not kept: try again next time.
    if (rows.length) kit = next;
    return next;
  })().finally(() => {
    building = null;
  });
  return building;
}

export interface ResolvedSearch {
  raw: string;
  /** As read, before any typo was corrected. */
  read: QueryIntent;
  /** As searched. */
  intent: QueryIntent;
  corrected: boolean;
  categories: CategoryIntent;
  /** Still typing: the last word may be the start of one. */
  prefixLast: boolean;
  /**
   * Still typing, and the words name no category yet ("earb", "women b"):
   * the likeliest completion, read ("earbuds", "women bag"), whose
   * categories `categories` are. The dropdown makes the same guess
   * (SearchAssist's buildModel), so the products it is sent come from the
   * category it shows as the best match, not from names that merely start
   * "earb" ("Earbud Case Cleaner").
   */
  guess: QueryIntent | null;
  /**
   * The category it names is wider than the words: they say what kind of
   * thing it is, and its name does not ("black water shoes": Women's Shoes
   * says "shoe", not "water"). Then the thing itself, wherever it is listed,
   * comes before the rest of that category (searchScore). Found 2026-10-06
   * from a photo of water shoes answered with heels and boots.
   */
  wider: boolean;
}

/** Do the words say a kind of thing the primary categories' names do not? Colours, cuts and whom-for words do not count. */
function isWider(intent: QueryIntent, categories: CategoryIntent, k: Kit): boolean {
  if (!categories.primary.length) return false;
  const named = new Set<string>();
  for (const h of categories.primary) {
    const c = k.index.byId.get(h.id);
    if (c) for (const s of [...c.ownStems, ...c.pathStems]) named.add(s);
  }
  return intent.words.some((w) => !isDescriptive(w) && !equivalents(w).some((e) => named.has(stem(e))));
}

/**
 * Reads a query: budget and quantity out, typos corrected (unless `exact`:
 * the shopper asked for what they typed), the category it names.
 */
export async function resolveSearch(raw: string, { typing = false, exact = false } = {}): Promise<ResolvedSearch> {
  const k = await searchKit();
  const read = understandQuery(raw);
  const open = typing && !/\s$/.test(raw);
  const { intent, corrected } = exact ? { intent: read, corrected: false } : correctWords(read, k.vocab, open);
  const last = intent.words[intent.words.length - 1] ?? "";
  let categories = resolveCategories(intent, k.index);
  let guess: QueryIntent | null = null;
  // Only for a word still half typed (as typed: the reading drops a lone
  // letter): "vacuum", typed whole, means vacuum, not "vacuum cup".
  const typedLast = nameWords(raw).pop() ?? "";
  if (open && !!typedLast && !k.completer.isWord(typedLast) && !categories.primary.length) {
    const top = k.completer.complete(raw, 1)[0] ?? (corrected ? k.completer.complete(intent.text, 1)[0] : undefined);
    const g = top ? understandQuery(top.text) : null;
    const found = g ? resolveCategories(g, k.index) : null;
    if (g && found?.primary.length) {
      guess = g;
      categories = { primary: found.primary, related: [...found.related, ...categories.related] };
    }
  }
  return {
    raw,
    read,
    intent,
    corrected,
    categories,
    prefixLast: open && last.length >= 3 && !k.completer.isWord(last),
    guess,
    wider: isWider(guess ?? intent, categories, k),
  };
}

// ---- Text match ------------------------------------------------------------

/**
 * How Postgres's English parser stored compounds in product names, for each
 * one-word form the search uses (measured: "T-Shirt" is 't-shirt' and
 * 'shirt'; "Smart Watch" is 'smart' and 'watch').
 */
const FTS_FORMS: Record<string, string> = {
  tshirt: "tshirt | t-shirt",
  smartwatch: "smartwatch | smart <-> watch",
  smartphone: "smartphone | smart <-> phone",
  earbuds: "earbuds | ear <-> buds",
  earphones: "earphones | ear <-> phones",
  headphones: "headphones | head <-> phones",
  sunglasses: "sunglasses | sun <-> glasses",
  flipflops: "flipflops | flip <-> flops",
  powerbank: "powerbank | power <-> bank",
  backpack: "backpack | back <-> pack",
};
const safe = (w: string) => w.replace(/[^a-z0-9]/g, "");

/** One word of a tsquery: the word, what means the same, and (still typing) the word as a prefix. */
function term(word: string, prefix: boolean): string {
  const alts = new Set<string>();
  for (const e of equivalents(word)) {
    const s = safe(e);
    if (s) alts.add(FTS_FORMS[s] ?? s);
  }
  if (prefix && safe(word)) alts.add(`${safe(word)}:*`);
  return `(${[...alts].join(" | ")})`;
}

/** The words as a tsquery: every word (`any`: some word), each with its equivalents. Empty when nothing is matchable. */
export function tsqueryFor(r: ResolvedSearch, { any = false } = {}): string {
  const ws = r.intent.words.filter((w) => safe(w));
  return ws.map((w, i) => term(w, r.prefixLast && i === ws.length - 1)).join(any ? " | " : " & ");
}

/** The words that say what the thing is, without its colour, cut or whom it is for ("water & shoe" of "black water shoes"). */
export function kindTsqueryFor(r: ResolvedSearch): string {
  const ws = r.intent.words.filter((w) => safe(w));
  const last = ws.length - 1;
  return ws
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => !isDescriptive(w))
    .map(({ w, i }) => term(w, r.prefixLast && i === last))
    .join(" & ");
}

/** The words that say what it is, next to each other ("water <-> shoe"), when there are two or more; else "". */
function kindPhraseFor(r: ResolvedSearch): string {
  const ws = r.intent.words.filter((w) => safe(w) && !isDescriptive(w));
  return ws.length >= 2 ? ws.map((w) => term(w, false)).join(" <-> ") : "";
}

/**
 * The thing itself as a match of its own, when it is not the category's
 * name: the category is wider (`wider`), or there is none and the words
 * also describe it ("cream leather office chair": 1 listing has every word,
 * hundreds are office chairs). The colour and the leather then order the
 * results; they do not empty them.
 */
function kindMatch(r: ResolvedSearch): { kind: string; extends: boolean; bonus: boolean } {
  const kind = kindTsqueryFor(r);
  if (!kind) return { kind, extends: false, bonus: false };
  const full = tsqueryFor(r);
  const named = r.categories.primary.length > 0;
  const bonus = r.wider || (!named && kind !== full);
  return { kind, extends: bonus && kind !== full, bonus };
}

const ACCESSORY_RE = `\\m(${ACCESSORY_TERMS.join("|")})\\M`;
const ACCESSORY_JS = new RegExp(`\\b(${ACCESSORY_TERMS.join("|")})\\b`, "i");
/** Words that make a category pets' things, in its own name or its parents' (as searchIntent's audienceOf). */
const PET_STEMS = new Set(["pet", "dog", "cat"]);

/** The categories a search reads first, as leaf ids: the primary ones' subtrees. */
export function primaryLeaves(r: ResolvedSearch): string[] {
  return [...new Set(r.categories.primary.flatMap((h) => h.subtree))];
}
function relatedLeaves(r: ResolvedSearch): string[] {
  const primary = new Set(primaryLeaves(r));
  return [...new Set(r.categories.related.slice(0, 3).flatMap((h) => h.subtree))].filter((id) => !primary.has(id));
}

/** Rows a search may return at all: moderation's rules (lib/moderation.ts), the same as every product query. */
export function moderationSql(blockedCategoryIds: string[]): Prisma.Sql[] {
  const out: Prisma.Sql[] = [];
  if (blockedCategoryIds.length) out.push(Prisma.sql`(p."categoryId" IS NULL OR p."categoryId" NOT IN (${Prisma.join(blockedCategoryIds)}))`);
  out.push(Prisma.sql`p."name" !~* ${blockedNameRegex()}`);
  const ids = blockedProductIdList();
  if (ids) out.push(Prisma.sql`p."id" NOT IN (${Prisma.join(ids)})`);
  return out;
}

/**
 * Which products a search matches: every word in the name (each with its
 * equivalents), or anywhere in the category it names. `any`: some word,
 * for a search the strict match finds too little for. Only Product (`p`)
 * is referenced, so the text index stays usable (see lib/search.ts).
 */
export function searchWhere(r: ResolvedSearch, { any = false } = {}): Prisma.Sql | null {
  const tsq = tsqueryFor(r, { any });
  const leaves = primaryLeaves(r);
  const parts: Prisma.Sql[] = [];
  if (tsq) parts.push(Prisma.sql`to_tsvector('english', p."name") @@ to_tsquery('english', ${tsq})`);
  if (leaves.length) parts.push(Prisma.sql`p."categoryId" IN (${Prisma.join(leaves)})`);
  const kind = any ? null : searchKindWhere(r);
  if (kind) parts.push(kind);
  return parts.length ? Prisma.sql`(${Prisma.join(parts, " OR ")})` : null;
}

/** The text half of searchWhere: every word in the name. Null when there is nothing to match by name. */
export function searchTextWhere(r: ResolvedSearch, { any = false } = {}): Prisma.Sql | null {
  const tsq = tsqueryFor(r, { any });
  return tsq ? Prisma.sql`to_tsvector('english', p."name") @@ to_tsquery('english', ${tsq})` : null;
}

/**
 * For a search nothing matched: names with any of the words that say what
 * it is, or with any word when none does. Not the colours: "black" or
 * "green" alone are in some 300,000 names, and ranking all of them took
 * 7–9s ("neon green black water shoes", measured 2026-10-06).
 */
export function searchLooseWhere(r: ResolvedSearch): Prisma.Sql | null {
  const ws = r.intent.words.filter((w) => safe(w));
  const kinds = ws.filter((w) => !isDescriptive(w));
  const use = kinds.length ? kinds : ws;
  if (!use.length) return null;
  return Prisma.sql`to_tsvector('english', p."name") @@ to_tsquery('english', ${use.map((w) => term(w, false)).join(" | ")})`;
}

/** The thing itself, whatever its colour (kindMatch), when that widens the match. Null when it does not. */
export function searchKindWhere(r: ResolvedSearch): Prisma.Sql | null {
  const m = kindMatch(r);
  return m.extends ? Prisma.sql`to_tsvector('english', p."name") @@ to_tsquery('english', ${m.kind})` : null;
}

/**
 * How well a product answers the search, highest first:
 *   the category it names, first of all (1000), and its near neighbours a
 *   little (120); how well the name matches the words (ts_rank_cd, up to
 *   ~400); the name starting with, or containing, the words as typed; and,
 *   for a device asked for as itself, its accessories well down (-350):
 *   "mobile phone" is the phone before the phone's holder.
 *   When that category is wider than the words, or there is none and the
 *   words also describe the thing (kindMatch), being the thing comes first
 *   (1000) and being in the category second (400): "black water shoes" is
 *   water shoes of any colour, black ones first, before heels that happen
 *   to be in Women's Shoes.
 */
export function searchScore(r: ResolvedSearch): Prisma.Sql {
  const tsq = tsqueryFor(r);
  const leaves = primaryLeaves(r);
  const near = relatedLeaves(r);
  const phrase = r.intent.text;
  const parts: Prisma.Sql[] = [Prisma.sql`0`];
  const kind = kindMatch(r);
  if (kind.bonus) parts.push(Prisma.sql`(CASE WHEN to_tsvector('english', p."name") @@ to_tsquery('english', ${kind.kind}) THEN 1000 ELSE 0 END)`);
  if (leaves.length) parts.push(Prisma.sql`(CASE WHEN p."categoryId" IN (${Prisma.join(leaves)}) THEN ${Prisma.raw(kind.bonus ? "400" : "1000")} ELSE 0 END)`);
  if (near.length) parts.push(Prisma.sql`(CASE WHEN p."categoryId" IN (${Prisma.join(near)}) THEN 120 ELSE 0 END)`);
  if (tsq) parts.push(Prisma.sql`(ts_rank_cd(to_tsvector('english', p."name"), to_tsquery('english', ${tsq})) * 400)`);
  // Every word must be in a name for the rank above to count at all, so a
  // colour or a material left every sneaker unranked ("white leather
  // sneakers" led with laces and insoles from Sneakers' leaves): the words
  // that say what it is rank it too, and side by side ("water shoes", not
  // "Water Diamond… Shoes") rank it higher.
  if (kind.kind && kind.kind !== tsq) parts.push(Prisma.sql`(ts_rank_cd(to_tsvector('english', p."name"), to_tsquery('english', ${kind.kind})) * 300)`);
  const together = kindPhraseFor(r);
  if (together) parts.push(Prisma.sql`(CASE WHEN to_tsvector('english', p."name") @@ to_tsquery('english', ${together}) THEN 150 ELSE 0 END)`);
  if (phrase) {
    const esc = phrase.replace(/[\\%_]/g, (m) => `\\${m}`);
    parts.push(Prisma.sql`(CASE WHEN p."name" ILIKE ${`${esc}%`} THEN 120 WHEN p."name" ILIKE ${`%${esc}%`} THEN 60 ELSE 0 END)`);
  }
  if (accessoriesSink(r.intent)) parts.push(Prisma.sql`(CASE WHEN p."name" ~* ${ACCESSORY_RE} THEN -350 ELSE 0 END)`);
  return Prisma.sql`(${Prisma.join(parts, " + ")})`;
}

// ---- As you type -------------------------------------------------------------

export interface SuggestedProduct {
  id: number;
  name: string;
  imageUrl: string | null;
  categoryId: string | null;
  category: string | null;
}

/** Do the words say more than the primary categories' names do ("red" in "red dress")? */
function wordsBeyondCategories(r: ResolvedSearch, k: Kit): boolean {
  const named = new Set<string>();
  for (const h of r.categories.primary) {
    const c = k.index.byId.get(h.id);
    if (c) for (const s of [...c.ownStems, ...c.pathStems]) named.add(s);
  }
  return r.intent.stems.some((s) => !equivalents(s).some((e) => named.has(stem(e))));
}

/** The head noun alone as a tsquery ("knife" of "kitchen knife"), for inside a category whose name says the rest. */
function headTsquery(r: ResolvedSearch): string {
  const h = r.intent.head;
  if (!h) return "";
  const w = r.intent.words.find((x) => stem(x) === h) ?? h;
  return safe(w) ? term(w, false) : "";
}

/**
 * A few products for the words being typed, fast, then ordered here, in
 * memory, the way searchScore orders them. Where they come from:
 *   - the category the words name: the products in it whose names say
 *     the thing asked for (the head noun, or every word when the words say
 *     more than the category's name does: "red dress"), and the newest few
 *     per leaf around them. Newest alone showed a cake turntable and a
 *     whisk for "kitchen knife": Kitchen Knives & Accessories is half
 *     accessories;
 *   - with no such category, the names the text index matches, those in
 *     the nearest categories first ("water bottle": Drinkware, before
 *     the pet bottles that the index happened to hand back first).
 * Queries that do not depend on each other run together.
 */
export async function suggestProducts(typed: ResolvedSearch, limit = 6): Promise<SuggestedProduct[]> {
  if (typed.intent.empty) return [];
  // A half-typed word's products are its likeliest completion's (see `guess`).
  const r: ResolvedSearch = typed.guess ? { ...typed, intent: typed.guess, prefixLast: false } : typed;
  const k = await searchKit();
  const blocked = Prisma.join(moderationSql(k.blocked), " AND ");
  const tsq = tsqueryFor(r);
  const leaves = primaryLeaves(r).slice(0, 48);
  const near = leaves.length ? [] : relatedLeaves(r).slice(0, 48);
  const beyond = !!tsq && wordsBeyondCategories(r, k);
  type Row = { id: number; name: string; imageUrl: string | null; categoryId: string | null };
  const named = (q: string, scope: string[], cap: number) =>
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT p."id", p."name", p."imageUrl", p."categoryId" FROM "Product" p
      WHERE to_tsvector('english', p."name") @@ to_tsquery('english', ${q})
        ${scope.length ? Prisma.sql`AND p."categoryId" IN (${Prisma.join(scope)})` : Prisma.empty} AND ${blocked}
      LIMIT ${cap}`);
  const tasks: Promise<Row[]>[] = [];
  if (leaves.length) {
    const inside = beyond ? tsq : headTsquery(r) || tsq;
    if (inside) tasks.push(named(inside, leaves, 80));
    if (!beyond) {
      // A few from each leaf, and enough from each to fill the row when there are only one or two.
      const each = Math.max(3, Math.ceil(limit / leaves.length));
      tasks.push(prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT x."id", x."name", x."imageUrl", x."categoryId"
        FROM unnest(ARRAY[${Prisma.join(leaves)}]::text[]) AS c(id)
        CROSS JOIN LATERAL (
          SELECT p."id", p."name", p."imageUrl", p."categoryId" FROM "Product" p
          WHERE p."categoryId" = c.id AND ${blocked}
          ORDER BY p."id" DESC LIMIT ${each}
        ) x
        LIMIT 60`));
    }
  } else if (tsq) {
    if (near.length) tasks.push(named(tsq, near, 60));
    // No category to lean on: a wider pool, for the order below to choose from.
    tasks.push(named(tsq, [], 240));
  }
  // The thing itself, wherever it is listed and whatever its colour, when the category is wider than the words (kindMatch).
  const kind = kindMatch(r);
  if (kind.bonus) tasks.push(named(kind.kind, [], 120));
  let rows = (await Promise.all(tasks)).flat();
  // The category had too few with those words: the words anywhere.
  if (leaves.length && tsq && rows.length < limit) rows = rows.concat(await named(tsq, [], 60));
  const inPrimary = new Set(leaves);
  const inNear = new Set(near);
  const sink = accessoriesSink(r.intent);
  const words = r.intent.words.map((w) => w.toLowerCase());
  const kindWords = words.filter((w) => !isDescriptive(w));
  const phrase = r.intent.text.toLowerCase();
  // Pets' things only when asked for ("hair dryer" is not a dog's).
  const petsAsked = r.intent.stems.some((s) => PET_STEMS.has(s));
  const forPets = (id: string | null) => {
    const c = id ? k.index.byId.get(id) : undefined;
    return !!c && [...c.ownStems, ...c.pathStems].some((s) => PET_STEMS.has(s));
  };
  const seen = new Set<number>();
  return rows
    .filter((p) => !seen.has(p.id) && seen.add(p.id) && !isNameBlocked(p.name) && !isProductIdBlocked(p.id))
    .map((p) => {
      const n = p.name.toLowerCase();
      const covered = words.filter((w) => equivalents(w).some((e) => n.includes(e))).length / Math.max(1, words.length);
      // As searchScore: when the category is wider than the words, being the thing comes before being in it.
      const isKind = kind.bonus && kindWords.length > 0 && kindWords.every((w) => equivalents(w).some((e) => n.includes(e)));
      const inCategory = p.categoryId && inPrimary.has(p.categoryId) ? (kind.bonus ? 40 : 100) : p.categoryId && inNear.has(p.categoryId) ? 40 : 0;
      const where = inCategory + (isKind ? 100 : 0);
      // The phrase first in the name is what the product is; far down, a word about it ("…Skull Frame Hair Dryer Decorative Lights").
      const at = phrase ? n.indexOf(phrase) : -1;
      const placed = at === 0 ? 10 : at > 0 && at < 24 ? 7 : at > 0 ? 3 : 0;
      const score = where + covered * 30 + placed - (sink && ACCESSORY_JS.test(p.name) ? 60 : 0) - (!petsAsked && forPets(p.categoryId) ? 30 : 0);
      return { p, score };
    })
    .sort((a, b) => b.score - a.score || b.p.id - a.p.id)
    .slice(0, limit)
    .map(({ p }) => ({ ...p, category: p.categoryId ? k.byId.get(p.categoryId)?.name ?? null : null }));
}

/** As-you-type completions and categories, computed on the server for callers that do not run the engine themselves (the app). */
export async function suggestText(raw: string, limit = 8): Promise<{ completions: string[]; categories: CategoryHit[] }> {
  const k = await searchKit();
  const completions = k.completer.complete(raw, limit).map((c) => c.text);
  const r = await resolveSearch(raw, { typing: true });
  const cats = [...r.categories.primary, ...categoriesStartingWith(raw, k.index, 6, k.completer.isWord), ...r.categories.related];
  const seen = new Set<string>();
  return { completions, categories: cats.filter((c) => !seen.has(c.id) && seen.add(c.id)).slice(0, 6) };
}

/** A category's picture and parent, for a response. */
export async function categoryCard(id: string) {
  const k = await searchKit();
  const c = k.byId.get(id);
  return c ? { id: c.id, name: c.name, parentName: c.parentName, thumbnailUrl: c.thumbnailUrl } : null;
}
