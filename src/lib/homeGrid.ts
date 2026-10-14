import { Prisma } from ".prisma/client";
import { prisma } from "@/lib/prisma";
import { GET as getCategories } from "@/app/api/categories/route";
import { TAG_CATEGORIES, TAG_PRODUCTS } from "@/lib/cacheTags";
import { cachedOnce } from "@/lib/cachedOnce";
import { dayOf, weekKey, weekSpan } from "@/lib/drawKeys";
import { blockedCategoryIdSet, blockedProductIdList, isCategoryBlocked } from "@/lib/moderation";
import { preferredCategoryIds } from "@/lib/products";
import { readSnapshot } from "@/lib/snapshotStore";
import { categoryLabel } from "@/lib/searchIntent";
import { kindPattern } from "@/lib/kindPattern";

/**
 * The homepage's category grid (the owner's plan of 2026-10-08, after
 * Amazon's homepage): card after card of the catalogue, edge to edge, every
 * one shown (no button for more). It replaced the "Trending products" fan
 * carousel.
 *
 * Three kinds of card, so the grid does not read as one set repeated:
 *   - "tiles": a family of the catalogue (its four main branches) or one of
 *     its groups (that group's four biggest kinds), each tile a real
 *     category, named and pictured, never counted: product counts on every
 *     tile read as clutter (the owner, 2026-10-08), so none leave the server;
 *   - "weekly": this week's picks, eight products from across the families,
 *     picked afresh every Monday. Not new products: nothing has been added
 *     since 8 September 2026, and the owner asked for weekly picks from the
 *     10 lakh+ already there;
 *   - "ranked": the categories buyers asked us to source most, by real quote
 *     requests, numbered.
 *
 * Only what the data can say, from the clean families the homepage already
 * draws from (preferredCategoryIds in lib/products.ts: no women's clothing, whose
 * photography the name rules cannot judge, see moderation.ts), and each
 * category on one card only.
 */

/** A category, as a tile: it opens its category. */
export interface GridCategoryTile {
  kind: "category";
  id: string;
  name: string;
  image: string;
  /** Pictures of more of its products, for the hover preview. */
  previews: string[];
}

/** A product, as a tile: it opens the product, and its quote button the form. */
export interface GridProductTile {
  kind: "product";
  id: number;
  name: string;
  image: string;
  category: string | null;
  previews: string[];
}

export type GridTile = GridCategoryTile | GridProductTile;

/** A family or a group of it: four of its categories. */
export interface TilesCard {
  kind: "tiles";
  key: string;
  title: string;
  /** One line under the title: what a family holds, or which family a group is in. */
  subtitle: string;
  href: string;
  tiles: GridCategoryTile[];
}
/** This week's picks: a band across the grid, under its first row. In the order of cards it is where that row ends. */
export interface WeeklyCard {
  kind: "weekly";
  key: string;
  /** The week, Monday to Sunday, as the band says it: "5–11 Oct". */
  span: string;
  tiles: GridProductTile[];
}
/** The categories buyers asked us to source most: a card two columns wide. */
export interface RankedCard {
  kind: "ranked";
  key: string;
  /** How many days back the requests are counted. */
  days: number;
  /** In order of requests, most first. */
  tiles: GridCategoryTile[];
}
export type GridCard = TilesCard | WeeklyCard | RankedCard;

/**
 * The grid is four cards across, two on a phone. The page draws the first
 * twelve columns (three rows at four across) and carries the rest as data,
 * which the section draws as it comes near; the whole grid is kept to whole
 * rows, so the last is never half empty.
 */
const BATCH = 12;
const ROW = 4;
/** The columns a card takes: the week's picks are a band of their own, the ranking is two wide. */
const spanOf = (c: GridCard) => (c.kind === "weekly" ? 0 : c.kind === "ranked" ? 2 : 1);

const TILES = 4;
const WEEKLY_PICKS = 8;
const RANKED = 5;
/** A category smaller than this is a stray ("Cup 2", "Outdoor 1"), not one to show. */
const MIN_PRODUCTS = 30;

/**
 * Kept off the homepage's tiles even inside a clean family: underwear,
 * swimwear and sportswear are photographed on bodies, which no name rule can
 * judge (the activewear close-ups moderation.ts describes). Still found by
 * search and in their categories.
 */
const HOMEPAGE_SKIP = /\b(underwear|lingerie|swim\w*|bikini|intimates?|briefs|boxers?|sportswear|sports clothing|yoga)\b/i;

/** The clean families, in the copy their cards use. */
const FAMILIES = [
  { top: "Home, Garden & Furniture", title: "Home & Kitchen", subtitle: "Storage, kitchenware and textiles" },
  { top: "Consumer Electronics", title: "Electronics", subtitle: "Audio, smart devices and cameras" },
  { top: "Pet Supplies", title: "Pet Supplies", subtitle: "Apparel, toys, collars and beds" },
  { top: "Home Improvement", title: "Home Improvement", subtitle: "Tools, lighting and appliances" },
  { top: "Men's Clothing", title: "Men's Fashion", subtitle: "Jackets, bottoms and T-shirts" },
  { top: "Toys, Kids & Babies", title: "Toys & Kids", subtitle: "Toys and clothing for kids" },
  { top: "Sports & Outdoors", title: "Sports & Outdoors", subtitle: "Cycling, fishing and equipment" },
  { top: "Automobiles & Motorcycles", title: "Auto & Moto", subtitle: "Car and bike parts and accessories" },
  { top: "Computer & Office", title: "Computer & Office", subtitle: "Office electronics and accessories" },
] as const;

type CatRow = { id: string; name: string; parentId: string | null; parentName?: string | null; thumbnailUrl: string | null; displayLabel?: string | null; productCount: number };

/** As a tile says it: its display name, and a bare "Solid" with its garment ("Solid T-Shirts", as search's chips). */
const nameOf = (r: CatRow) => categoryLabel((r.displayLabel || r.name).trim(), r.parentName?.trim());

/** The category tree, with each category's whole-subtree product count. */
function treeOf(rows: CatRow[]) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const kids = new Map<string, CatRow[]>();
  for (const r of rows) {
    if (!r.parentId) continue;
    const list = kids.get(r.parentId) ?? [];
    list.push(r);
    kids.set(r.parentId, list);
  }
  const totals = new Map<string, number>();
  const total = (id: string): number => {
    const known = totals.get(id);
    if (known !== undefined) return known;
    const n = (byId.get(id)?.productCount ?? 0) + (kids.get(id) ?? []).reduce((s, k) => s + total(k.id), 0);
    totals.set(id, n);
    return n;
  };
  const path = (id: string) => {
    const names: string[] = [];
    for (let c = byId.get(id); c; c = c.parentId ? byId.get(c.parentId) : undefined) names.push(c.name);
    return names;
  };
  const descendants = (id: string): CatRow[] => (kids.get(id) ?? []).flatMap((k) => [k, ...descendants(k.id)]);
  /** Shown on the homepage at all: not moderated, not a kind kept off its tiles. */
  const showable = (id: string) => {
    const p = path(id);
    return !p.some((n) => isCategoryBlocked(n)) && !HOMEPAGE_SKIP.test(p.join(" "));
  };
  /** A tile of its own: a picture, enough products, nothing kept off the homepage. */
  const tileable = (r: CatRow) => !!r.thumbnailUrl && total(r.id) >= MIN_PRODUCTS && showable(r.id);
  return { byId, kids, total, descendants, showable, tileable };
}
type Tree = ReturnType<typeof treeOf>;

/**
 * What a draw is made from: the categories the site shows (moderation's
 * blocked ones and everything under them left out), each with its stored
 * count, and the clean families' ids (lib/products.ts preferredCategoryIds).
 */
export interface CatalogueInput {
  rows: CatRow[];
  cleanIds: Set<string>;
}

/** The input as the database has it now, for the refresh: not the hour's cache, which holds yesterday's counts. */
export async function catalogueInput(): Promise<CatalogueInput> {
  const all = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const blocked = blockedCategoryIdSet(all);
  return { rows: all.filter((c) => !blocked.has(c.id)), cleanIds: new Set(preferredCategoryIds(all)) };
}

/** Where a category's preview pictures come from: itself if it holds products, and its biggest holders under it. */
function previewSources(r: CatRow, t: Tree): string[] {
  const holders = t
    .descendants(r.id)
    .filter((d) => d.productCount > 0 && t.showable(d.id))
    .sort((a, b) => b.productCount - a.productCount);
  return [...(r.productCount > 0 ? [r.id] : []), ...holders.map((h) => h.id)].slice(0, 2);
}

/** The newest few products with a picture in each category, moderated as every product query is. */
async function picturesIn(categoryIds: string[], perCategory: number) {
  if (!categoryIds.length) return [] as { categoryId: string; id: number; imageUrl: string }[];
  const blocked = blockedProductIdList();
  return prisma.$queryRaw<{ categoryId: string; id: number; imageUrl: string }[]>(Prisma.sql`
    SELECT x."categoryId", x."id", x."imageUrl"
    FROM unnest(ARRAY[${Prisma.join(categoryIds)}]::text[]) AS c(id)
    CROSS JOIN LATERAL (
      SELECT p."categoryId", p."id", p."imageUrl" FROM "Product" p
      WHERE p."categoryId" = c.id AND p."isBlockedName" = false AND p."imageUrl" IS NOT NULL
        ${blocked ? Prisma.sql`AND p."id" NOT IN (${Prisma.join(blocked)})` : Prisma.empty}
      ORDER BY p."id" DESC
      LIMIT ${perCategory}
    ) x`);
}

// The day and the week the draws are keyed by, as India has them: lib/drawKeys.ts.
export { weekKey, weekSpan };

/** A small seeded generator, so a week's picks are the same for everyone, all week. */
function seeded(key: string) {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A seeded place in a category: the product that many down from its newest;
 * with `match`, that many down among the newest few hundred whose names match
 * it (telling).
 */
type Place = { id: string; offset: number; match?: string };
type PlacedProduct = { id: number; name: string; imageUrl: string; categoryId: string; allImages: unknown };

/**
 * Seeded places in some categories: a category from each group in turn, each
 * group's order shuffled so no one group fills the set, and in each category a
 * place among its newest few thousand. Groups and their categories are sorted
 * before they are shuffled, so the same seed gives the same places whatever
 * order the tree arrived in.
 */
function placesIn(groups: CatRow[][], want: number, rand: () => number): Place[] {
  const shuffled = <T,>(a: T[]) => {
    const out = [...a];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const byId = (a: CatRow, b: CatRow) => a.id.localeCompare(b.id);
  const sorted = groups.filter((g) => g.length).map((g) => [...g].sort(byId)).sort((a, b) => byId(a[0], b[0]));
  const queues = shuffled(sorted).map((g) => shuffled(g));
  const chosen: Place[] = [];
  while (chosen.length < want && queues.some((q) => q.length)) {
    for (const q of queues) {
      const r = q.shift();
      if (r && chosen.length < want) chosen.push({ id: r.id, offset: Math.floor(rand() * Math.min(r.productCount, 3000)) });
    }
  }
  return chosen;
}

/**
 * The product at each place, moderated as every product query is: one read,
 * through the (categoryId, id DESC) index, a row a place. In the places'
 * order, with nothing where a place found no product, so a caller can split
 * the answer back into the sets it asked for.
 */
async function productsAt(places: Place[]): Promise<(PlacedProduct | undefined)[]> {
  if (!places.length) return [];
  const blocked = blockedProductIdList();
  // A place with a pattern looks among its category's newest MATCH_SCAN only, so a category whose names
  // rarely match (one holds 151,948 products) is never read to its end.
  const rows = await prisma.$queryRaw<(PlacedProduct & { n: number })[]>(Prisma.sql`
    SELECT c.n::int AS n, x."id", x."name", x."imageUrl", x."categoryId", x."allImages"
    FROM unnest(
      ARRAY[${Prisma.join(places.map((c) => c.id))}]::text[],
      ARRAY[${Prisma.join(places.map((c) => c.offset))}]::int[],
      ARRAY[${Prisma.join(places.map((c) => c.match ?? ""))}]::text[]
    ) WITH ORDINALITY AS c(id, k, m, n)
    CROSS JOIN LATERAL (
      SELECT s.* FROM (
        SELECT p."id", p."name", p."imageUrl", p."categoryId", p."allImages" FROM "Product" p
        WHERE p."categoryId" = c.id AND p."isBlockedName" = false AND p."imageUrl" IS NOT NULL
          ${blocked ? Prisma.sql`AND p."id" NOT IN (${Prisma.join(blocked)})` : Prisma.empty}
        ORDER BY p."id" DESC
        LIMIT CASE WHEN c.m = '' THEN c.k + 1 ELSE ${MATCH_SCAN}::int END
      ) s
      WHERE c.m = '' OR s."name" ~* c.m
      ORDER BY s."id" DESC
      OFFSET c.k
      LIMIT 1
    ) x`);
  const at = new Map(rows.map((r) => [r.n, r]));
  return places.map((_, i) => at.get(i + 1));
}
const found = <T,>(rows: (T | undefined)[]) => rows.filter((r): r is T => !!r);

/**
 * How far down its newest a telling place looks, and among how many of those
 * that match it is drawn. Bounded, the spotlight's draw reads in 0.6s what
 * took 1.4s at the old places' depth of up to 3,000 (measured on 42 places).
 */
const MATCH_SCAN = 400;
const TELLING_RANGE = 100;

/**
 * Where a picture under its category's name should come from: a product of the
 * category that says so. CJ files some products where they do not belong (a
 * car charger under "VR & AR Devices", a kitchen scale under "Batteries"), and
 * a seeded place can land on one. So each place is tried first as one of the
 * newest products whose names match its kind, then as the newest that does,
 * the same again on the broad pattern, and only then as any product among
 * its newest MATCH_SCAN. Read the answer back with firstOfEach.
 */
function telling(places: Place[], t: Tree, rand: () => number): Place[][] {
  return places.map((p) => {
    const r = t.byId.get(p.id);
    if (!r) return [p];
    const tiers = [...new Set([kindPattern(nameOf(r)), kindPattern(nameOf(r), true)].filter(Boolean))];
    const range = Math.min(r.productCount, TELLING_RANGE);
    const any = { id: p.id, offset: Math.floor(rand() * Math.min(r.productCount, MATCH_SCAN)) };
    return [...tiers.flatMap((match) => [{ id: p.id, offset: Math.floor(rand() * range), match }, { id: p.id, offset: 0, match }]), any];
  });
}
/** Each set's first product that `seen` does not hold yet (and then does), from productsAt's answer to the sets end to end. */
function firstOfEach(sets: Place[][], answer: (PlacedProduct | undefined)[], seen: Set<number>): (PlacedProduct | undefined)[] {
  let at = 0;
  return sets.map((set) => {
    const p = found(answer.slice(at, at + set.length)).find((x) => !seen.has(x.id));
    at += set.length;
    if (p) seen.add(p.id);
    return p;
  });
}

/** The clean categories that hold products, grouped by the top of the tree each is under. */
function holdersByFamily(t: Tree, cleanIds: Set<string>) {
  const families = new Map<string, CatRow[]>();
  for (const id of cleanIds) {
    const r = t.byId.get(id);
    if (!r || r.productCount < 10 || !t.showable(id)) continue;
    let top = r;
    while (top.parentId && t.byId.get(top.parentId)) top = t.byId.get(top.parentId)!;
    const list = families.get(top.id) ?? [];
    list.push(r);
    families.set(top.id, list);
  }
  return families;
}

/** Eight products for a week, from anywhere in the clean families, the families taken in turn. */
async function weeklyPicks(week: string, t: Tree, cleanIds: Set<string>) {
  const places = placesIn([...holdersByFamily(t, cleanIds).values()], WEEKLY_PICKS + 4, seeded(week));
  return found(await productsAt(places)).slice(0, WEEKLY_PICKS);
}

/** Categories ranked by the quote requests buyers sent for their products, recent first; none if too few. */
async function requestedCategories(cleanIds: Set<string>, t: Tree): Promise<{ rows: CatRow[]; days: number }> {
  for (const days of [30, 90]) {
    const rows = await prisma.$queryRaw<{ id: string; n: number }[]>(Prisma.sql`
      SELECT p."categoryId" AS id, COUNT(*)::int AS n, MAX(i."createdAt") AS last
      FROM "Inquiry" i JOIN "Product" p ON p."id" = i."productId"
      WHERE i.status <> 'deleted' AND i."createdAt" > now() - ${days}::int * interval '1 day' AND p."categoryId" IS NOT NULL
      GROUP BY 1
      ORDER BY n DESC, last DESC
      LIMIT 60`);
    const picked = rows
      .map((r) => t.byId.get(r.id))
      .filter((r): r is CatRow => !!r && cleanIds.has(r.id) && t.tileable(r))
      .slice(0, RANKED);
    if (picked.length === RANKED) return { rows: picked, days };
  }
  return { rows: [], days: 0 };
}

/**
 * Every card, for a week, from the catalogue as the daily refresh read it
 * (lib/snapshots.ts). Made there, a day ahead, and stored; never on a request.
 */
export async function computeGrid(input: CatalogueInput, week: string, span: string): Promise<GridCard[]> {
  const rows = input.rows;
  const t = treeOf(rows);
  const cleanIds = input.cleanIds;
  const tops = new Map(rows.filter((r) => !r.parentId).map((r) => [r.name.trim(), r]));
  // Each of these is one card at most: one failing costs that card, never the grid.
  const quietly = async <T,>(what: string, run: () => Promise<T>, otherwise: T): Promise<T> => {
    try {
      return await run();
    } catch (e) {
      console.error(`home grid: ${what} failed`, e);
      return otherwise;
    }
  };

  // A category is a tile on one card only; "Most requested" claims its own first.
  const taken = new Set<string>();
  const requested = await quietly("most requested", () => requestedCategories(cleanIds, t), { rows: [] as CatRow[], days: 0 });
  for (const r of requested.rows) taken.add(r.id);
  const pick = (candidates: CatRow[]) => {
    const got = candidates.filter((r) => !taken.has(r.id) && t.tileable(r)).sort((a, b) => t.total(b.id) - t.total(a.id)).slice(0, TILES);
    if (got.length < TILES) return null;
    for (const g of got) taken.add(g.id);
    return got;
  };

  // The families: each one's four biggest main branches.
  const families = FAMILIES.flatMap((f) => {
    const top = tops.get(f.top);
    const tiles = top ? pick(t.kids.get(top.id) ?? []) : null;
    return top && tiles ? [{ f, top, tiles }] : [];
  });
  // Their groups: each main branch with four kinds of its own, the biggest first, the families in turn.
  const groupQueues = families.map(({ f, top }) =>
    (t.kids.get(top.id) ?? [])
      .filter((g) => t.showable(g.id))
      .sort((a, b) => t.total(b.id) - t.total(a.id))
      .map((g) => ({ f, g })),
  );
  const groups: { f: (typeof FAMILIES)[number]; g: CatRow; tiles: CatRow[] }[] = [];
  while (groupQueues.some((q) => q.length)) {
    for (const q of groupQueues) {
      const next = q.shift();
      if (!next) continue;
      const tiles = pick(t.kids.get(next.g.id) ?? []);
      if (tiles) groups.push({ ...next, tiles });
    }
  }

  const picks = await quietly("this week's picks", () => weeklyPicks(week, t, cleanIds), [] as Awaited<ReturnType<typeof weeklyPicks>>);

  // Every preview picture in one read: each tile's sources, and each pick's own category.
  const tileRows = [...requested.rows, ...families.flatMap((x) => x.tiles), ...groups.flatMap((x) => x.tiles)];
  const sources = new Map(tileRows.map((r) => [r.id, previewSources(r, t)]));
  const sourceIds = [...new Set([...[...sources.values()].flat(), ...picks.map((p) => p.categoryId)])];
  const pictures = await quietly("hover previews", () => picturesIn(sourceIds, 2), []);
  const inCategory = new Map<string, { id: number; imageUrl: string }[]>();
  for (const p of pictures) {
    const list = inCategory.get(p.categoryId) ?? [];
    list.push(p);
    inCategory.set(p.categoryId, list);
  }

  const categoryTile = (g: CatRow): GridCategoryTile => {
    // One picture from each source in turn, so a preview shows the category's range.
    const lists = (sources.get(g.id) ?? []).map((id) => inCategory.get(id) ?? []);
    const previews: string[] = [];
    for (let i = 0; previews.length < 2 && lists.some((l) => l[i]); i++) {
      for (const l of lists) if (l[i] && l[i].imageUrl !== g.thumbnailUrl && previews.length < 2 && !previews.includes(l[i].imageUrl)) previews.push(l[i].imageUrl);
    }
    return { kind: "category", id: g.id, name: nameOf(g), image: g.thumbnailUrl as string, previews };
  };
  const productTile = (p: (typeof picks)[number]): GridProductTile => {
    const own = Array.isArray(p.allImages) ? (p.allImages as unknown[]).filter((u): u is string => typeof u === "string" && u !== p.imageUrl) : [];
    const neighbours = (inCategory.get(p.categoryId) ?? []).filter((x) => x.id !== p.id).map((x) => x.imageUrl);
    const category = t.byId.get(p.categoryId);
    return { kind: "product", id: p.id, name: p.name.trim(), image: p.imageUrl, category: category ? nameOf(category) : null, previews: [...own, ...neighbours].slice(0, 2) };
  };

  const familyCards: TilesCard[] = families.map(({ f, top, tiles }) => ({
    kind: "tiles",
    key: `family-${top.id}`,
    title: f.title,
    subtitle: f.subtitle,
    href: `/products/?categoryId=${top.id}`,
    tiles: tiles.map(categoryTile),
  }));
  const groupCards: TilesCard[] = groups.map(({ f, g, tiles }) => ({
    kind: "tiles",
    key: `group-${g.id}`,
    title: nameOf(g),
    subtitle: `In ${f.title}`,
    href: `/products/?categoryId=${g.id}`,
    tiles: tiles.map(categoryTile),
  }));
  const weekly: WeeklyCard | null = picks.length >= TILES ? { kind: "weekly", key: "weekly", span, tiles: picks.map(productTile) } : null;
  const ranked: RankedCard | null = requested.rows.length ? { kind: "ranked", key: "requested", days: requested.days, tiles: requested.rows.map(categoryTile) } : null;

  // What buyers asked for first, then the families, then their groups; the week's picks are a
  // band under the first row (four columns: one row at four across, two at two).
  const body: GridCard[] = [...(ranked ? [ranked] : []), ...familyCards, ...groupCards];
  let at = 0;
  for (let used = 0; at < body.length && used < ROW; at++) used += spanOf(body[at]);
  const cards = weekly ? [...body.slice(0, at), weekly, ...body.slice(at)] : body;
  // Whole rows only, so the last is never half empty: the smallest groups, last in turn, go.
  const first = firstBatch(cards);
  return cards.slice(0, cards.length - ((cards.length - first) % ROW));
}

/** How many cards make the first batch: twelve columns' worth, the band and the ranking included. */
function firstBatch(cards: GridCard[]) {
  let used = 0;
  let n = 0;
  while (n < cards.length && used + spanOf(cards[n]) <= BATCH) used += spanOf(cards[n++]);
  return n;
}

/** This week's grid, every card: the daily refresh's draw. Empty until a refresh has stored one. */
export async function getHomeGrid(now = new Date()): Promise<GridCard[]> {
  return (await readSnapshot<GridCard[]>("home-grid", weekKey(now))) ?? [];
}

/** The cards the page draws, its first twelve columns; and the rest, every one a family or a group, which the section draws as it comes near. */
export function firstCards(cards: GridCard[]) {
  const n = firstBatch(cards);
  return { cards: cards.slice(0, n), rest: cards.slice(n).filter((c): c is TilesCard => c.kind === "tiles") };
}

/**
 * The homepage's spotlight band (ProductSpotlightSection, the owner's call of
 * 2026-10-08, after Flipkart's "Spotlight's on" and Amazon's themed cards):
 * one clean family a day, in turn, and products from across it, one from each
 * of as many of its categories, its main branches taken in turn. Under them,
 * its shelves (the owner's ask, 2026-10-08, after Amazon's 2x2 cards): its
 * biggest main branches, four kinds each, two by two, each named and the way
 * to its own category, pictured by one of its products. A shelf of six
 * products under their category strips and clipped names (2026-10-11) the
 * owner found clumsy: at four shelves across, every label was cut short.
 * The same catalogue rules as the grid: moderated, nothing kept off the
 * homepage, and no product twice in the band.
 */
export interface SpotlightProduct {
  id: number;
  name: string;
  image: string;
  /** Its category, for the label strip on its picture. */
  category: string | null;
}
/** A kind on a shelf: a category of the branch, and a product of it for its picture. */
export interface SpotlightKind {
  /** As its tile names it ("Speakers"). */
  name: string;
  href: string;
  /** The day's draw, not the category's own picture, which the grid above already shows. */
  image: string;
  /** Whose picture it is, so the page can leave out one the week's picks already show. */
  productId: number;
}
export interface SpotlightShelf {
  /** A main branch of the family ("Interior Accessories"). */
  title: string;
  href: string;
  kinds: SpotlightKind[];
}
export interface Spotlight {
  /** The family, as its card in the grid names it ("Home & Kitchen"). */
  title: string;
  /** What it holds, as its card in the grid says it ("Storage, kitchenware and textiles"). */
  subtitle: string;
  href: string;
  products: SpotlightProduct[];
  shelves: SpotlightShelf[];
}
/**
 * More than the band shows (twelve products in its window, the owner having
 * found six "looking less", 2026-10-11; four kinds on a shelf), so the page
 * can leave out any that the week's picks already show and still fill it.
 */
const SPOTLIGHT_PICKS = 18;
const SHELVES = 4;
/** A shelf shows four kinds; one with fewer is left off. */
export const SHELF_KINDS = 4;
const SHELF_KINDS_SENT = 6;

/**
 * Whether a kind's name fits the two lines its tile gives it, at fifteen
 * characters a line: what a 123px tile, the narrowest a shelf has, holds at
 * its type size. Broken where the browser would break it, at spaces, so
 * "Earphones & Headphones" fits and "Christmas Decoration Supplies" (three
 * lines there) does not; a kind left off a shelf is still in its category.
 */
function fitsTwoLines(name: string, perLine = 15) {
  let lines = 1;
  let used = 0;
  for (const word of name.split(" ").filter(Boolean)) {
    if (word.length > perLine) return false;
    if (!used) used = word.length;
    else if (used + 1 + word.length <= perLine) used += 1 + word.length;
    else {
      lines++;
      used = word.length;
    }
  }
  return lines <= 2;
}

/** A day's spotlight, from the catalogue as the daily refresh read it (lib/snapshots.ts); never on a request. */
export async function computeSpotlight(input: CatalogueInput, day: number): Promise<Spotlight | null> {
  const rows = input.rows;
  const t = treeOf(rows);
  const cleanIds = input.cleanIds;
  const tops = new Map(rows.filter((r) => !r.parentId).map((r) => [r.name.trim(), r]));
  const holders = holdersByFamily(t, cleanIds);
  // A family a day, in turn; one that is missing or too small hands its day to the next.
  for (let k = 0; k < FAMILIES.length; k++) {
    const f = FAMILIES[(day + k) % FAMILIES.length];
    const top = tops.get(f.top);
    const inFamily = top ? holders.get(top.id) ?? [] : [];
    if (!top || inFamily.length < 6) continue;
    // Grouped by main branch, so the six are not all storage boxes.
    const branchOf = (r: CatRow) => {
      let c = r;
      while (c.parentId && c.parentId !== top.id && t.byId.get(c.parentId)) c = t.byId.get(c.parentId)!;
      return c.id;
    };
    const branches = new Map<string, CatRow[]>();
    for (const r of inFamily) branches.set(branchOf(r), [...(branches.get(branchOf(r)) ?? []), r]);
    const rand = seeded(`spotlight-${day}`);
    const rowPlaces = placesIn([...branches.values()], SPOTLIGHT_PICKS, rand);
    // The shelves: the biggest branches with four kinds or more of a fair
    // size, each kind once, in an order that turns with the day. Never the
    // branch itself as a kind of it (a branch can hold products of its own),
    // which would be its own title again.
    const shelfBranches = [...branches.entries()]
      .map(([id, kinds]) => [id, kinds.filter((k) => k.id !== id && k.productCount >= MIN_PRODUCTS && fitsTwoLines(nameOf(k)))] as const)
      .filter(([id, kinds]) => kinds.length >= SHELF_KINDS && t.byId.has(id))
      .sort((a, b) => t.total(b[0]) - t.total(a[0]))
      .slice(0, SHELVES);
    const shelfPlaces = shelfBranches.map(([, kinds]) => placesIn(kinds.map((kind) => [kind]), Math.min(SHELF_KINDS_SENT, kinds.length), rand));
    // Every product the band shows, in one read, each a product of what its
    // label says (telling): the window's strips and the shelves' names both
    // name its category.
    const rowSets = telling(rowPlaces, t, rand);
    const shelfSets = shelfPlaces.map((places) => telling(places, t, rand));
    const answer = await productsAt([...rowSets, ...shelfSets.flat()].flat());
    const seen = new Set<number>();
    const shown = (p: PlacedProduct): SpotlightProduct => {
      const c = t.byId.get(p.categoryId);
      return { id: p.id, name: p.name.trim(), image: p.imageUrl, category: c ? nameOf(c) : null };
    };
    const picks = found(firstOfEach(rowSets, answer, seen));
    if (picks.length < 12) continue;
    let from = rowSets.flat().length;
    const shelves = shelfBranches
      .map(([id], i) => {
        const asked = shelfSets[i].flat().length;
        const list = found(firstOfEach(shelfSets[i], answer.slice(from, from + asked), seen));
        from += asked;
        const branch = t.byId.get(id)!;
        const kinds = list.map((p) => ({ name: nameOf(t.byId.get(p.categoryId)!), href: `/products/?categoryId=${p.categoryId}`, image: p.imageUrl, productId: p.id }));
        return { title: nameOf(branch), href: `/products/?categoryId=${id}`, kinds };
      })
      .filter((s) => s.kinds.length >= SHELF_KINDS);
    return {
      title: f.title,
      subtitle: f.subtitle,
      href: `/products/?categoryId=${top.id}`,
      products: picks.map(shown),
      // Two or four, so a row of them is never half empty.
      shelves: shelves.slice(0, shelves.length >= 4 ? 4 : shelves.length >= 2 ? 2 : 0),
    };
  }
  return null;
}

/** Today's spotlight: the day as India has it, so the family changes at midnight IST. The refresh's draw. */
export async function getSpotlight(now = new Date()): Promise<Spotlight | null> {
  return readSnapshot<Spotlight>("home-spotlight", String(dayOf(now)));
}

/**
 * The homepage's lower sections (the owner's ask of 2026-10-11, after
 * Amazon's rails and Flipkart's "Suggested for you"): a family's row of
 * products, the trades the catalogue stocks for, and a mix from across it.
 * Each is drawn a day at a time, as the spotlight is, by the same rules:
 * moderated, nothing kept off the homepage, each product one of what its
 * category says (telling), and none of the spotlight's. The page leaves out
 * any another section already shows (page.tsx), so each sends more than it
 * shows. Cached apart, so the page reads them side by side.
 */

/** The tree, each clean family's holders, and the tops by name: where every lower draw starts. */
function catalogue(input: CatalogueInput) {
  const t = treeOf(input.rows);
  const holders = holdersByFamily(t, input.cleanIds);
  return { t, holders, tops: new Map(input.rows.filter((r) => !r.parentId).map((r) => [r.name.trim(), r])) };
}

/** The products the day's spotlight shows, which the lower sections leave out. */
function spotlightIds(s: Spotlight | null) {
  return new Set<number>(s ? [...s.products.map((p) => p.id), ...s.shelves.flatMap((x) => x.kinds.map((k) => k.productId))] : []);
}

/** A product as a lower section's tile shows it. */
function asShown(p: PlacedProduct, t: Tree): SpotlightProduct {
  const c = t.byId.get(p.categoryId);
  return { id: p.id, name: p.name.trim(), image: p.imageUrl, category: c ? nameOf(c) : null };
}

/** A family's clean holders, grouped by the main branch each is under, so a row is not all one branch. */
function branchesIn(inFamily: CatRow[], top: CatRow, t: Tree): CatRow[][] {
  const branchOf = (r: CatRow) => {
    let c = r;
    while (c.parentId && c.parentId !== top.id && t.byId.get(c.parentId)) c = t.byId.get(c.parentId)!;
    return c.id;
  };
  const branches = new Map<string, CatRow[]>();
  for (const r of inFamily) branches.set(branchOf(r), [...(branches.get(branchOf(r)) ?? []), r]);
  return [...branches.values()];
}

/** Several draws' telling places in one read, and each draw's products, none twice (seen). */
async function drawn(draws: Place[][][], seen: Set<number>) {
  const answer = await productsAt(draws.flat(2));
  let from = 0;
  return draws.map((sets) => {
    const asked = sets.flat().length;
    const list = found(firstOfEach(sets, answer.slice(from, from + asked), seen));
    from += asked;
    return list;
  });
}

/** A family's row of products (ProductRailSection): the families after the day's spotlight, in its turn. */
export interface ProductRail {
  /** The family, as its card in the grid names it. */
  title: string;
  subtitle: string;
  href: string;
  products: SpotlightProduct[];
}
/** A rail shows eight (six on a laptop), and the page four rails; one more travels, for the page's leaving out. */
export const RAIL_SHOWN = 8;
export const RAILS_SHOWN = 4;
const RAIL_PICKS = 12;

export async function computeRails(input: CatalogueInput, day: number, spotlight: Spotlight | null): Promise<ProductRail[]> {
  const { t, holders, tops } = catalogue(input);
  const rand = seeded(`rails-${day}`);
  const plans: { f: (typeof FAMILIES)[number]; top: CatRow; sets: Place[][] }[] = [];
  for (let k = 0; k < FAMILIES.length && plans.length < RAILS_SHOWN + 1; k++) {
    const f = FAMILIES[(day + k) % FAMILIES.length];
    const top = tops.get(f.top);
    const inFamily = top ? holders.get(top.id) ?? [] : [];
    if (!top || f.title === spotlight?.title || inFamily.length < 6) continue;
    plans.push({ f, top, sets: telling(placesIn(branchesIn(inFamily, top, t), RAIL_PICKS, rand), t, rand) });
  }
  const lists = await drawn(
    plans.map((p) => p.sets),
    spotlightIds(spotlight),
  );
  return plans
    .map(({ f, top }, i) => ({ title: f.title, subtitle: f.subtitle, href: `/products/?categoryId=${top.id}`, products: lists[i].map((p) => asShown(p, t)) }))
    .filter((r) => r.products.length >= RAIL_SHOWN);
}

/** Today's family rails. The refresh's draw. */
export async function getRails(now = new Date()): Promise<ProductRail[]> {
  return (await readSnapshot<ProductRail[]>("home-rails", String(dayOf(now)))) ?? [];
}

/**
 * A trade the catalogue stocks for (TradesSection): a kind of shop or
 * business, the categories it buys from, and products of them. From the
 * clean families only, and every one a real category: one that is missing or
 * kept off the homepage is left out, and a trade left with fewer than four
 * goes. A trade's line is 42 characters at most, one line on a 360px phone.
 */
export interface Trade {
  key: string;
  title: string;
  line: string;
  /** The categories it buys from, as their tiles name them. */
  kinds: { name: string; href: string }[];
  products: SpotlightProduct[];
}
/** A trade shows twelve products (two rows of six on a wide screen); two more travel, for the page's leaving out. */
export const TRADE_SHOWN = 12;
const TRADE_PICKS = 14;
const HOME = "Home, Garden & Furniture";
const IMPROVE = "Home Improvement";
const ELEC = "Consumer Electronics";
const AUTO = "Automobiles & Motorcycles";
const SPORT = "Sports & Outdoors";
const OFFICE = "Computer & Office";
const PETS = "Pet Supplies";
const TOYS = "Toys, Kids & Babies";
const MEN = "Men's Clothing";
const TRADES: { key: string; title: string; line: string; kinds: [top: string, name: string][] }[] = [
  { key: "cafe", title: "Cafés & restaurants", line: "Cups, plates, glasses and kitchen tools", kinds: [[HOME, "Drinkware"], [HOME, "Dinnerware"], [HOME, "Cooking Tools"], [HOME, "Barware"], [HOME, "Bakeware"], [HOME, "Kitchen Knives & Accessories"]] },
  { key: "pets", title: "Pet shops", line: "Collars, leads, bowls, beds and toys", kinds: [[PETS, "Pet Collars"], [PETS, "Pet Leashes"], [PETS, "Pet Bowls"], [PETS, "Pet Nests"], [PETS, "Pet Toy Set"], [PETS, "Pet Clothings"], [PETS, "Cat Trees & Condos"]] },
  { key: "toys", title: "Toy stores", line: "Figures, plush toys, blocks and RC toys", kinds: [[TOYS, "Action & Toy Figures"], [TOYS, "Stuffed & Plush Animals"], [TOYS, "Blocks"], [TOYS, "RC Helicopters"], [TOYS, "Electronic Pets"]] },
  { key: "hardware", title: "Hardware stores", line: "Hand and power tools, sets and storage", kinds: [[IMPROVE, "Hand Tools"], [IMPROVE, "Power Tools"], [IMPROVE, "Tool Sets"], [IMPROVE, "Garden Tools"], [IMPROVE, "Measurement & Analysis"], [IMPROVE, "Tools Storage"]] },
  { key: "auto", title: "Car accessory shops", line: "Seat covers, dash cams, lights, key cases", kinds: [[AUTO, "Steering Covers"], [AUTO, "Automobiles Seat Covers"], [AUTO, "Key Case for Car"], [AUTO, "Car Stickers"], [AUTO, "Vehicle Camera"], [AUTO, "Car Mirror Video"], [AUTO, "Car Lights"]] },
  { key: "events", title: "Event planners", line: "Party supplies, flowers, cake decorating", kinds: [[HOME, "Event & Party Supplies"], [HOME, "Decorative Flowers & Wreaths"], [HOME, "Party Masks"], [HOME, "Cake Decorating Supplies"], [HOME, "Christmas Decoration Supplies"], [HOME, "Ribbons"]] },
  { key: "hotels", title: "Hotels & homestays", line: "Bedding, towels, curtains, night lights", kinds: [[HOME, "Bedding Sets"], [HOME, "Pillows"], [HOME, "Towels"], [HOME, "Curtains"], [HOME, "Comforters"], [HOME, "Bathroom Storage"], [IMPROVE, "Night Lights"]] },
  { key: "office", title: "Offices & stationers", line: "Supplies, printers, USB drives and bags", kinds: [[OFFICE, "Office & School Supplies"], [OFFICE, "Printers"], [OFFICE, "Printer Supplies"], [OFFICE, "USB Flash Drives"], [OFFICE, "Laptop Bags & Cases"], [HOME, "Stationeries"]] },
  { key: "gadgets", title: "Gadget stores", line: "Earphones, smart watches, speakers, drones", kinds: [[ELEC, "Earphones & Headphones"], [ELEC, "Smart Watches"], [ELEC, "Speakers"], [ELEC, "Camera Drones"], [ELEC, "Gamepads"], [ELEC, "Charger"], [ELEC, "Projectors"]] },
  { key: "lighting", title: "Lighting stores", line: "Ceiling, wall, solar and string lights", kinds: [[IMPROVE, "Ceiling Lights"], [IMPROVE, "Wall Lamps"], [IMPROVE, "Chandeliers"], [IMPROVE, "Pendant Lights"], [IMPROVE, "LED Spotlights"], [IMPROVE, "Solar Lamps"], [IMPROVE, "String Lights"]] },
  { key: "outdoor", title: "Outdoor & sports shops", line: "Camping, fishing, cycling and fitness", kinds: [[SPORT, "Camping & Hiking"], [SPORT, "Fishing Lures"], [SPORT, "Rod Combos"], [SPORT, "Bicycle Lights"], [SPORT, "Bicycle Helmets"], [SPORT, "Fitness & Bodybuilding"], [IMPROVE, "Flashlights & Torches"]] },
  { key: "menswear", title: "Menswear stores", line: "Hoodies, blazers, shirts and caps", kinds: [[MEN, "Man Hoodies & Sweatshirts"], [MEN, "Suits & Blazer"], [MEN, "Men's Shirts"], [MEN, "Casual Pants"], [MEN, "Man Jeans"], [MEN, "Baseball Caps"], [MEN, "Belts"]] },
];

export async function computeTrades(input: CatalogueInput, day: number, spotlight: Spotlight | null): Promise<Trade[]> {
  const { t, holders, tops } = catalogue(input);
  const rand = seeded(`trades-${day}`);
  const plans = TRADES.flatMap((trade) => {
    const kinds = trade.kinds.flatMap(([top, name]) => {
      const family = tops.get(top);
      const r = family ? (holders.get(family.id) ?? []).find((h) => h.name.trim() === name) : undefined;
      return r ? [r] : [];
    });
    // Each kind thrice in its queue: placesIn takes one a queue a round, and a trade asks for more than it has kinds.
    return kinds.length >= 4 ? [{ trade, kinds, sets: telling(placesIn(kinds.map((k) => [k, k, k]), TRADE_PICKS, rand), t, rand) }] : [];
  });
  const lists = await drawn(
    plans.map((p) => p.sets),
    spotlightIds(spotlight),
  );
  const trades = plans
    .map(({ trade, kinds }, i) => ({
      key: trade.key,
      title: trade.title,
      line: trade.line,
      kinds: kinds.map((k) => ({ name: nameOf(k), href: `/products/?categoryId=${k.id}` })),
      products: lists[i].map((p) => asShown(p, t)),
    }))
    .filter((x) => x.products.length >= TRADE_SHOWN);
  // The day's trade first and the rest after it in their order, so the section opens on a new one each day.
  const at = day % Math.max(1, trades.length);
  return [...trades.slice(at), ...trades.slice(0, at)];
}

/** Today's trades, the day's one first. The refresh's draw. */
export async function getTrades(now = new Date()): Promise<Trade[]> {
  return (await readSnapshot<Trade[]>("home-trades", String(dayOf(now)))) ?? [];
}

/**
 * "More to explore" (MoreToExploreSection): a category from each clean family
 * in turn, a product from each. Forty-eight on the page, which fills whole
 * rows at two, three, four, six and eight across; more travel, for the
 * page's leaving out.
 */
export const MORE_SHOWN = 48;
const MORE_PICKS = 64;

export async function computeMore(input: CatalogueInput, day: number, spotlight: Spotlight | null): Promise<SpotlightProduct[]> {
  const { t, holders, tops } = catalogue(input);
  const rand = seeded(`more-${day}`);
  const families = FAMILIES.flatMap((f) => {
    const top = tops.get(f.top);
    const list = top ? holders.get(top.id) ?? [] : [];
    return list.length ? [list] : [];
  });
  const [list] = await drawn([telling(placesIn(families, MORE_PICKS, rand), t, rand)], spotlightIds(spotlight));
  return list.map((p) => asShown(p, t));
}

/** Today's mix. The refresh's draw. */
export async function getMore(now = new Date()): Promise<SpotlightProduct[]> {
  return (await readSnapshot<SpotlightProduct[]>("home-more", String(dayOf(now)))) ?? [];
}

/**
 * The categories beside a product's own, for its page (ProductDetailView's
 * "Related categories"): the others under the same parent, biggest first, then
 * those beside the parent; each with a picture, enough products, and nothing
 * kept off the homepage's tiles (treeOf's tileable: the same moderation, and
 * no underwear or swimwear photographed on a body). From the categories
 * route's tree, cached an hour per category.
 */
export interface RelatedCategory {
  id: string;
  name: string;
  image: string;
}
export const getRelatedCategories = cachedOnce(
  async (categoryId: string): Promise<RelatedCategory[]> => {
    const res = await getCategories();
    const rows: CatRow[] = ((await res.json()) as { data?: CatRow[] }).data ?? [];
    const t = treeOf(rows);
    const self = t.byId.get(categoryId);
    if (!self) return [];
    const under = (parentId: string, not: string) =>
      (t.kids.get(parentId) ?? []).filter((r) => r.id !== not && t.tileable(r)).sort((a, b) => t.total(b.id) - t.total(a.id));
    const parent = self.parentId ? t.byId.get(self.parentId) : undefined;
    // The category's siblings, then its parent's, then what is under its parent's siblings (so a category with few
    // relations still has rows to fill a tall screen's column). A product on a branch of its own (EPROLO puts some
    // there): what is under it.
    const uncles = parent?.parentId ? under(parent.parentId, parent.id) : [];
    const cousins = uncles.flatMap((u) => under(u.id, self.id)).sort((a, b) => t.total(b.id) - t.total(a.id));
    const seen = new Set<string>();
    const list = (parent ? [...under(parent.id, self.id), ...uncles, ...cousins] : under(self.id, "")).filter((r) => !seen.has(r.id) && !!seen.add(r.id));
    // Sixteen, eight rows: as many as a tall screen's column has room for (the page shows the whole rows that fit).
    return list.slice(0, 16).map((r) => ({ id: r.id, name: nameOf(r), image: r.thumbnailUrl! }));
  },
  ["pdp-related-categories-v3"],
  { revalidate: 3600, tags: [TAG_CATEGORIES, TAG_PRODUCTS] },
);
