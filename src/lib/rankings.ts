import { Prisma } from ".prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { blockedCategoryIdSet, blockedProductIdList } from "@/lib/moderation";
import { TAG_CATEGORIES, TAG_PRODUCTS } from "@/lib/cacheTags";
import { kindPattern } from "@/lib/kindPattern";
import { getCachedAllCategories as getCatalogueCategories } from "@/lib/products";

// ---------------------------------------------------------------------------
// Rankings data, shared by the API route and the page.
//
// This lived inside src/app/api/rankings/route.ts, which meant the only way to
// read it was over HTTP — so the page fetched its own API from the browser and
// rendered skeletons until that returned. Server-rendering the first screen
// needs the query callable directly, and a route file is the wrong place to
// export it from: Next reserves those exports.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Top Ranking API.
//
// Powers the Alibaba-style /rankings page: category "ranking cards", each
// showing its top few products with #1/#2/#3 badges, grouped under a scope
// (all categories, or one selected top-level category drilled down to its
// biggest sub/leaf categories).
//
// HONESTY NOTE: this catalog has no sales/order/review data (see CLAUDE.md), so
// there is no real "hot selling" or "most popular" metric. These tabs are two
// deterministic orderings of the products we DO have — `hot` = newest listings
// first, `popular` = long-standing listings first — presented as a curated
// showcase. No fabricated numbers, no prices (consistent with the whole site).
// ---------------------------------------------------------------------------



type CategoryLite = { id: string; name: string; parentId: string | null; parentName: string | null; thumbnailUrl: string | null };

const getCachedAllCategories = unstable_cache(
  async (): Promise<CategoryLite[]> => {
    const cats = await prisma.category.findMany({
      select: { id: true, name: true, parentId: true, parentName: true, thumbnailUrl: true },
    });
    return cats;
  },
  ["all-categories-lite-v4"],
  { revalidate: 3600 }
);

// Product count per category that holds any, biggest first: the stored counts
// (Category.productCount, refreshed daily by lib/snapshots.ts), a read of the
// category table. It was an aggregate over the whole product table, about a
// second each time the hour's cache ran out (2026-10-14).
const getCachedLeafCounts = unstable_cache(
  async (): Promise<Array<{ categoryId: string; count: number }>> => {
    const rows = await prisma.category.findMany({
      where: { productCount: { gt: 0 } },
      select: { id: true, productCount: true },
      orderBy: [{ productCount: "desc" }, { id: "asc" }],
    });
    return rows.map((r) => ({ categoryId: r.id, count: r.productCount }));
  },
  ["leaf-category-counts-v2"],
  { revalidate: 3600, tags: [TAG_CATEGORIES] }
);

/**
 * Ranking cards a read brings when it does not say (the app says), and what
 * the page renders on the server: fifteen, five rows of three. The page reads
 * the rest ahead of the scroll (RankingsClient).
 */
export const DEFAULT_GROUP_LIMIT = 15;
/** Ranked products a card carries (#1..#3). */
export const PRODUCTS_PER_GROUP = 3;
/**
 * How far down a category's newest a ranked product is looked for among those
 * its name says it is, and how many of the best of those the moderation
 * pattern is then run on (four times what is shown, should any be left out).
 */
const RANK_SCAN = 400;
const RANK_FINALISTS = 12;

/** One product inside a ranking card; `rank` drives the #1/#2/#3 badge. */
export type RankProduct = { id: number; name: string; imageUrl: string | null; rank: number };

/** One ranking card: a category and its top few products. */
export type RankGroup = { id: string; name: string; parentName: string | null; products: RankProduct[] };

export type RankingsPayload = {
  scopeName: string;
  tab?: string;
  groups: RankGroup[];
  hasMore: boolean;
};

/**
 * A page of the ranking: a slice of the whole list (getCachedRankingList), so
 * every page after the first costs nothing but the slice. Each page used to be
 * its own query, 1.5 to 2.2s on the dev server, and the page waited on it
 * behind a "Load More Categories" button; the owner wanted every category, and
 * nothing to wait for (2026-10-11).
 */
export async function getCachedRankings(tab: string, offset: number, limit: number, parentId: string | null): Promise<RankingsPayload> {
  // The categories from lib/products.ts's cache, not this file's: getCachedRankingList reads this file's
  // inside its own cache, and one unstable_cache read both nested and on its own in a render can come back
  // `undefined` while its entry regenerates (lib/snapshotStore.ts, readSnapshotNow). It did, in a
  // prerender of /rankings on 2026-10-14: "Cannot read properties of undefined (reading 'map')".
  const [whole, cats] = await Promise.all([getCachedRankingList(tab === "popular" ? "popular" : "hot"), getCatalogueCategories()]);
  // A scope's cards are the whole list's that sit under it, in the same order with the same products: filtered
  // here, outside the cache, so choosing a scope never waits on a query. Filtered inside a cached function of its
  // own, every scope's first read ran the whole list's query again (2 to 4s), the inner cache not answering.
  const byId = new Map(cats.map((c) => [c.id, c]));
  const scope = parentId ? byId.get(parentId) : undefined;
  const under = (id: string) => {
    for (let c = byId.get(id); c; c = c.parentId ? byId.get(c.parentId) : undefined) if (c.id === scope!.id) return true;
    return false;
  };
  const groups = scope ? whole.groups.filter((g) => under(g.id)) : whole.groups;
  return { scopeName: scope ? scope.name : "All Categories", tab, groups: groups.slice(offset, offset + limit), hasMore: offset + limit < groups.length };
}

/**
 * The whole response, cached — not just the category helpers.
 *
 * Only getCachedAllCategories and getCachedLeafCounts were cached before, and
 * they were never the cost: the route answers in 0.35s when the product query
 * is skipped and 4-9s when it runs. So every single visitor to /rankings/ paid
 * for that query, and while it was in flight the page showed nothing but
 * skeletons — which is exactly what "the page never loads" turned out to be.
 *
 * unstable_cache keys on the arguments, so each tab/scope/page is cached
 * separately. 60s matches the categories route: short enough that a
 * moderation removal reaches viewers inside a minute, which matters because
 * these are product listings.
 */
const getCachedRankingList = unstable_cache(
  async (tab: string): Promise<{ groups: RankGroup[] }> => {
    const [allCats, leafCounts] = await Promise.all([
      getCachedAllCategories(),
      getCachedLeafCounts(),
    ]);
    const catById = new Map(allCats.map((c) => [c.id, c]));

    // Every category, biggest first, the page taking them a slice at a time
    // (getCachedRankings), which filters a scope's from them.
    // blockedCategoryIdSet, not isCategoryBlocked on the leaf's own name.
    // Products hang off leaves, and a leaf is usually named something like
    // "Boxers" or "Sleep & Lounge" — the adult signal is on the PARENT
    // ("Underwear & Loungewear"), which a name-only test never reads. Every
    // other surface uses the descendant-aware set; this one did not.
    const blockedCats = blockedCategoryIdSet(allCats);
    const scopedIds = leafCounts
      .filter((lc) => catById.has(lc.categoryId) && !blockedCats.has(lc.categoryId))
      .map((lc) => lc.categoryId);
    const groupIds = scopedIds;

    if (groupIds.length === 0) {
      return { groups: [] };
    }

    // Empty when nothing is blocked by id, so the clause disappears entirely
    // rather than becoming `NOT IN ()`, which is a syntax error in Postgres.
    const blockedIds = blockedProductIdList();
    const blockedIdsClause = blockedIds
      ? Prisma.sql`AND "id" NOT IN (${Prisma.join(blockedIds)})`
      : Prisma.empty;

    // The top PRODUCTS_PER_GROUP products for every card. `hot` shows newest
    // listings, `popular` the earliest (established) ones — two honest,
    // deterministic orderings.
    //
    // A LATERAL join per category, NOT a window function, and the difference
    // is the whole reason /rankings/ used to sit on empty skeletons.
    //
    // This was ROW_NUMBER() OVER (PARTITION BY "categoryId"), filtered to
    // rn <= 3 outside the subquery. Postgres cannot push that limit into a
    // window, so it ranked every row in every partition first: the fifteen
    // biggest categories hold 486,897 products between them, and the query
    // sorted all of them to return 45. Roughly 10,800 rows read per row
    // returned. Worse, the un-indexable `name !~*` regex (650 characters, 47
    // keywords) was evaluated on each of those rows.
    //
    // Measured with EXPLAIN ANALYZE over the same fifteen categories:
    //
    //     window + regex (as it was)    4.82s
    //     window, no regex              0.67s
    //     regex, no window              9.30s
    //     this LATERAL form             0.00s
    //
    // LATERAL lets each category be answered independently by an index on
    // (categoryId, id): walk that one category in id order and stop at three.
    // The moderation rule still applies — it is not negotiable — now as the
    // stored isBlockedName flag, which the (categoryId, isBlockedName, id DESC)
    // index serves directly, rather than as the regex.
    // The rank is computed OUTSIDE the LATERAL, over the handful of rows that
    // survive it. Putting ROW_NUMBER() inside would have quietly undone the
    // whole fix: Postgres evaluates window functions after WHERE but before
    // LIMIT, so the inner query would have ranked every product in the
    // category before taking three — which is the original problem wearing a
    // different shape. Out here the window sees 45 rows.
    const dir = tab === "popular" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    // A product of what its card says first (lib/kindPattern.ts): among a
    // category's newest RANK_SCAN (oldest, on Most popular), those whose names
    // match its pattern, then the rest. CJ files some products where they do
    // not belong, and the biggest category, "Home Office Storage", ranked a pair
    // of sunglasses at its #1. Bounded, so a category whose names rarely match
    // is never read to its end.
    const patterns = groupIds.map((id) => kindPattern(catById.get(id)!.name) || kindPattern(catById.get(id)!.name, true));

    const rows = await prisma.$queryRaw<Array<{ id: number; name: string; imageUrl: string | null; categoryId: string; rn: number }>>(
      Prisma.sql`
        SELECT p."id", p."name", p."imageUrl", c."categoryId",
               ROW_NUMBER() OVER (PARTITION BY c."categoryId" ORDER BY p.tells DESC, p."id" ${dir}) AS rn
        FROM unnest(ARRAY[${Prisma.join(groupIds)}]::text[], ARRAY[${Prisma.join(patterns)}]::text[]) AS c("categoryId", m)
        CROSS JOIN LATERAL (
          SELECT t."id", t."name", t."imageUrl", t.tells
          FROM (
            SELECT s."id", s."name", s."imageUrl", (c.m <> '' AND s."name" ~* c.m) AS tells
            FROM (
              -- The category filter is not the whole rule. A product can be
              -- adult by NAME while sitting in a perfectly ordinary category —
              -- the reason blockedNameRegex exists — and this query once
              -- applied neither it nor the blocked-id list, so the rankings
              -- page could feature a product no other surface shows. The
              -- pattern itself was applied to the finalists only, since on 400
              -- rows a category it took the list from 0.7s to 7.2s (595
              -- categories, measured); its stored result, isBlockedName, costs
              -- nothing, so it applies to every row scanned (2026-10-14).
              SELECT "id", "name", "imageUrl"
              FROM "Product"
              WHERE "categoryId" = c."categoryId" AND "isBlockedName" = false AND "imageUrl" IS NOT NULL
                ${blockedIdsClause}
              ORDER BY "id" ${dir}
              LIMIT ${RANK_SCAN}
            ) s
            ORDER BY tells DESC, s."id" ${dir}
            LIMIT ${RANK_FINALISTS}
          ) t
          ORDER BY t.tells DESC, t."id" ${dir}
          LIMIT ${PRODUCTS_PER_GROUP}
        ) p
      `
    );

    // Assemble in the group order (biggest category first), products by rank.
    const byCat = new Map<string, Array<{ id: number; name: string; imageUrl: string | null; rank: number }>>();
    for (const r of rows) {
      if (!byCat.has(r.categoryId)) byCat.set(r.categoryId, []);
      byCat.get(r.categoryId)!.push({ id: r.id, name: r.name, imageUrl: r.imageUrl, rank: Number(r.rn) });
    }

    const groups = groupIds
      .map((id) => {
        const cat = catById.get(id)!;
        const products = (byCat.get(id) ?? []).sort((a, b) => a.rank - b.rank);
        return { id, name: cat.name, parentName: cat.parentName, products };
      })
      // A card shows three: a category with fewer (the list's tail, 21 of them, most holding one product) is
      // left out rather than shown half empty.
      .filter((g) => g.products.length >= PRODUCTS_PER_GROUP);

    return { groups };
  },
  ["rankings-list-v8"],
  // Five minutes, not the one the per-page cache had: this is every category's products in one query (a few
  // seconds to build), and the first read after it went stale waited on the rebuild (measured: 3.7s and 4.4s, a
  // minute apart). A moderation removal still leaves the page within five minutes, or at once by tag
  // (/api/revalidate).
  { revalidate: 300, tags: [TAG_CATEGORIES, TAG_PRODUCTS] }
);
