import { Prisma } from ".prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { GET as getCategories } from "@/app/api/categories/route";
import { TAG_CATEGORIES, TAG_PRODUCTS } from "@/lib/cacheTags";
import { blockedNameRegex, blockedProductIdList, isCategoryBlocked } from "@/lib/moderation";
import { getCachedPreferredCategories } from "@/lib/products";
import { categoryLabel } from "@/lib/searchIntent";

/**
 * The homepage's category grid (the owner's plan of 2026-10-08, after
 * Amazon's homepage): card after card of the catalogue, edge to edge, every
 * one shown (no button for more). It replaced the "Trending products" fan
 * carousel.
 *
 * Three kinds of card, so the grid does not read as one set repeated:
 *   - "tiles": a family of the catalogue (its four main branches) or one of
 *     its groups (that group's four biggest kinds), each tile a real
 *     category with its real count;
 *   - "weekly": this week's picks, eight products from across the families,
 *     picked afresh every Monday. Not new products: nothing has been added
 *     since 8 September 2026, and the owner asked for weekly picks from the
 *     10 lakh+ already there;
 *   - "ranked": the categories buyers asked us to source most, by real quote
 *     requests, numbered.
 *
 * Only what the data can say, from the clean families the homepage already
 * draws from (getCachedPreferredCategories: no women's clothing, whose
 * photography the name rules cannot judge, see moderation.ts), and each
 * category on one card only.
 */

/** A category, as a tile: it opens its category. */
export interface GridCategoryTile {
  kind: "category";
  id: string;
  name: string;
  /** Products under it, its whole subtree. */
  count: number;
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
  /** Products under it, its whole subtree, for the link to all of them. */
  count: number;
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
 * The grid is four cards across, two on a phone. The page itself carries the
 * first twelve columns (three rows at four across), and the section reads the
 * rest from /api/home-grid as it comes near; the whole grid is kept to whole
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
      WHERE p."categoryId" = c.id AND p."imageUrl" IS NOT NULL AND p."name" !~* ${blockedNameRegex()}
        ${blocked ? Prisma.sql`AND p."id" NOT IN (${Prisma.join(blocked)})` : Prisma.empty}
      ORDER BY p."id" DESC
      LIMIT ${perCategory}
    ) x`);
}

/** The date in India, as midnight UTC of that date: the week runs Monday to Sunday there. */
function istDay(now: Date) {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

/** The ISO week a date falls in, in India: the picks change at midnight on Monday, IST. */
export function weekKey(now = new Date()): string {
  const d = istDay(now);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const week = Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** The week's Monday to Sunday, as the band says it: "5–11 Oct", or "28 Sep – 4 Oct". */
export function weekSpan(now = new Date()): string {
  const monday = istDay(now);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() || 7) - 1));
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  const month = (d: Date) => MONTHS[d.getUTCMonth()];
  return monday.getUTCMonth() === sunday.getUTCMonth()
    ? `${monday.getUTCDate()}–${sunday.getUTCDate()} ${month(sunday)}`
    : `${monday.getUTCDate()} ${month(monday)} – ${sunday.getUTCDate()} ${month(sunday)}`;
}

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

/** A seeded place in a category: the product that many down from its newest. */
type Place = { id: string; offset: number };
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
  const rows = await prisma.$queryRaw<(PlacedProduct & { n: number })[]>(Prisma.sql`
    SELECT c.n::int AS n, x."id", x."name", x."imageUrl", x."categoryId", x."allImages"
    FROM unnest(ARRAY[${Prisma.join(places.map((c) => c.id))}]::text[], ARRAY[${Prisma.join(places.map((c) => c.offset))}]::int[]) WITH ORDINALITY AS c(id, k, n)
    CROSS JOIN LATERAL (
      SELECT p."id", p."name", p."imageUrl", p."categoryId", p."allImages" FROM "Product" p
      WHERE p."categoryId" = c.id AND p."imageUrl" IS NOT NULL AND p."name" !~* ${blockedNameRegex()}
        ${blocked ? Prisma.sql`AND p."id" NOT IN (${Prisma.join(blocked)})` : Prisma.empty}
      ORDER BY p."id" DESC
      OFFSET c.k
      LIMIT 1
    ) x`);
  const at = new Map(rows.map((r) => [r.n, r]));
  return places.map((_, i) => at.get(i + 1));
}
const found = <T,>(rows: (T | undefined)[]) => rows.filter((r): r is T => !!r);

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

/** Every card, for a week: built once an hour per server from the cached category tree. */
const buildGrid = unstable_cache(
  async (week: string, span: string): Promise<GridCard[]> => {
    const res = await getCategories();
    const rows: CatRow[] = ((await res.json()) as { data?: CatRow[] }).data ?? [];
    const t = treeOf(rows);
    const cleanIds = new Set(await getCachedPreferredCategories());
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
      return { kind: "category", id: g.id, name: nameOf(g), count: t.total(g.id), image: g.thumbnailUrl as string, previews };
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
      count: t.total(top.id),
      tiles: tiles.map(categoryTile),
    }));
    const groupCards: TilesCard[] = groups.map(({ f, g, tiles }) => ({
      kind: "tiles",
      key: `group-${g.id}`,
      title: nameOf(g),
      subtitle: `In ${f.title}`,
      href: `/products/?categoryId=${g.id}`,
      count: t.total(g.id),
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
  },
  ["home-grid-v3"],
  { revalidate: 3600, tags: [TAG_CATEGORIES, TAG_PRODUCTS] },
);

/** How many cards make the first batch: twelve columns' worth, the band and the ranking included. */
function firstBatch(cards: GridCard[]) {
  let used = 0;
  let n = 0;
  while (n < cards.length && used + spanOf(cards[n]) <= BATCH) used += spanOf(cards[n++]);
  return n;
}

/** This week's grid, every card. */
export const getHomeGrid = (now = new Date()) => buildGrid(weekKey(now), weekSpan(now));

/** The cards the page itself carries, its first twelve columns; and how many the section reads after them. */
export function firstCards(cards: GridCard[]) {
  const n = firstBatch(cards);
  return { cards: cards.slice(0, n), more: cards.length - n };
}

/**
 * The homepage's spotlight band (ProductSpotlightSection, the owner's call of
 * 2026-10-08, after Flipkart's "Spotlight's on" and Amazon's themed cards):
 * one clean family a day, in turn, and products from across it, one from each
 * of as many of its categories, its main branches taken in turn. Under them,
 * its shelves (the owner's ask, 2026-10-08, after Amazon's 2x2 cards): its
 * biggest main branches, four products each, each from a kind of its own.
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
export interface SpotlightShelf {
  /** A main branch of the family ("Interior Accessories"). */
  title: string;
  href: string;
  products: SpotlightProduct[];
}
export interface Spotlight {
  /** The family, as its card in the grid names it ("Home & Kitchen"). */
  title: string;
  href: string;
  /** Products in the whole family. */
  count: number;
  products: SpotlightProduct[];
  shelves: SpotlightShelf[];
}
/**
 * More than the band shows (six products in its row, four on a shelf), so the
 * page can leave out any that the week's picks already show and still fill it.
 */
const SPOTLIGHT_PICKS = 10;
const SHELVES = 4;
const SHELF_PICKS = 6;

const buildSpotlight = unstable_cache(
  async (day: number): Promise<Spotlight | null> => {
    const res = await getCategories();
    const rows: CatRow[] = ((await res.json()) as { data?: CatRow[] }).data ?? [];
    const t = treeOf(rows);
    const cleanIds = new Set(await getCachedPreferredCategories());
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
      // The shelves: the biggest branches with four kinds or more, a kind a product.
      const shelfBranches = [...branches.entries()]
        .filter(([id, kinds]) => kinds.length >= 4 && t.byId.has(id))
        .sort((a, b) => t.total(b[0]) - t.total(a[0]))
        .slice(0, SHELVES);
      const shelfPlaces = shelfBranches.map(([, kinds]) => placesIn(kinds.map((kind) => [kind]), SHELF_PICKS, rand));
      // Every product the band shows, in one read.
      const answer = await productsAt([...rowPlaces, ...shelfPlaces.flat()]);
      const seen = new Set<number>();
      const once = (list: (PlacedProduct | undefined)[]) =>
        found(list).filter((p) => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
      const shown = (p: PlacedProduct): SpotlightProduct => {
        const c = t.byId.get(p.categoryId);
        return { id: p.id, name: p.name.trim(), image: p.imageUrl, category: c ? nameOf(c) : null };
      };
      const picks = once(answer.slice(0, rowPlaces.length));
      if (picks.length < 6) continue;
      let from = rowPlaces.length;
      const shelves = shelfBranches
        .map(([id], i) => {
          const list = once(answer.slice(from, from + shelfPlaces[i].length));
          from += shelfPlaces[i].length;
          const branch = t.byId.get(id)!;
          return { title: nameOf(branch), href: `/products/?categoryId=${id}`, products: list.map(shown) };
        })
        .filter((s) => s.products.length >= TILES);
      return {
        title: f.title,
        href: `/products/?categoryId=${top.id}`,
        count: t.total(top.id),
        products: picks.map(shown),
        // Two or four, so a row of them is never half empty.
        shelves: shelves.slice(0, shelves.length >= 4 ? 4 : shelves.length >= 2 ? 2 : 0),
      };
    }
    return null;
  },
  ["home-spotlight-v2"],
  { revalidate: 3600, tags: [TAG_CATEGORIES, TAG_PRODUCTS] },
);

/** Today's spotlight: the day as India has it, so the family changes at midnight IST. */
export const getSpotlight = (now = new Date()) => buildSpotlight(Math.floor(istDay(now).getTime() / 86_400_000));
