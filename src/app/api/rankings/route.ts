import { NextResponse } from "next/server";
import { Prisma } from ".prisma/client";
import { prisma } from "../../../lib/prisma";
import { unstable_cache } from "next/cache";
import { blockedCategoryIdSet, blockedNameRegex, blockedProductIdList } from "@/lib/moderation";
import { TAG_CATEGORIES, TAG_PRODUCTS, MODERATION_SENSITIVE_CACHE_CONTROL } from "@/lib/cacheTags";

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


export const dynamic = "force-dynamic";

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

// Product count per leaf category, biggest first. One aggregate over the whole
// table — cached hourly so the rankings page never pays for it live.
const getCachedLeafCounts = unstable_cache(
  async (): Promise<Array<{ categoryId: string; count: number }>> => {
    const rows = await prisma.$queryRaw<Array<{ categoryId: string | null; count: number }>>(
      Prisma.sql`
        SELECT "categoryId", COUNT(*)::int AS count
        FROM "Product"
        WHERE "categoryId" IS NOT NULL
        GROUP BY "categoryId"
        ORDER BY count DESC
      `
    );
    return rows
      .filter((r): r is { categoryId: string; count: number } => Boolean(r.categoryId))
      .map((r) => ({ categoryId: r.categoryId, count: Number(r.count) }));
  },
  ["leaf-category-counts"],
  { revalidate: 3600 }
);

const DEFAULT_GROUP_LIMIT = 15; // ranking cards per page (load-more adds more)
const PRODUCTS_PER_GROUP = 3; // ranked products per card (#1..#3)

type RankingsPayload = {
  scopeName: string;
  tab?: string;
  groups: Array<{ id: string; name: string; parentName: string | null; products: unknown[] }>;
  hasMore: boolean;
};

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
const getCachedRankings = unstable_cache(
  async (tab: string, offset: number, limit: number, parentId: string | null): Promise<RankingsPayload> => {
    const [allCats, leafCounts] = await Promise.all([
      getCachedAllCategories(),
      getCachedLeafCounts(),
    ]);
    const catById = new Map(allCats.map((c) => [c.id, c]));

    // Build the set of leaf categories in scope. With a parent selected, that's
    // all its descendants; otherwise every category is a candidate.
    let inScope: (id: string) => boolean = () => true;
    let scopeName = "All Categories";
    if (parentId && catById.has(parentId)) {
      const childrenMap = new Map<string, string[]>();
      for (const c of allCats) {
        if (c.parentId) {
          if (!childrenMap.has(c.parentId)) childrenMap.set(c.parentId, []);
          childrenMap.get(c.parentId)!.push(c.id);
        }
      }
      const descendants = new Set<string>([parentId]);
      const queue = [parentId];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const ch of childrenMap.get(cur) ?? []) {
          if (!descendants.has(ch)) { descendants.add(ch); queue.push(ch); }
        }
      }
      inScope = (id) => descendants.has(id);
      scopeName = catById.get(parentId)?.name ?? scopeName;
    }

    // All categories in scope, biggest first. Windowed by offset/limit so the
    // page can "load more" through every category rather than a fixed 12.
    // blockedCategoryIdSet, not isCategoryBlocked on the leaf's own name.
    // Products hang off leaves, and a leaf is usually named something like
    // "Boxers" or "Sleep & Lounge" — the adult signal is on the PARENT
    // ("Underwear & Loungewear"), which a name-only test never reads. Every
    // other surface uses the descendant-aware set; this one did not.
    const blockedCats = blockedCategoryIdSet(allCats);
    const scopedIds = leafCounts
      .filter((lc) => inScope(lc.categoryId) && catById.has(lc.categoryId) && !blockedCats.has(lc.categoryId))
      .map((lc) => lc.categoryId);
    const groupIds = scopedIds.slice(offset, offset + limit);
    const hasMore = offset + limit < scopedIds.length;

    if (groupIds.length === 0) {
      return { scopeName, groups: [], hasMore: false };
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
    // LATERAL lets each category be answered independently by
    // Product_categoryId_id_desc_idx, which already existed: walk that one
    // category in id order and stop at three. The regex still runs — the
    // moderation rule is not negotiable — but on a handful of rows per
    // category rather than half a million.
    // The rank is computed OUTSIDE the LATERAL, over the handful of rows that
    // survive it. Putting ROW_NUMBER() inside would have quietly undone the
    // whole fix: Postgres evaluates window functions after WHERE but before
    // LIMIT, so the inner query would have ranked every product in the
    // category before taking three — which is the original problem wearing a
    // different shape. Out here the window sees 45 rows.
    const innerOrder = tab === "popular"
      ? Prisma.sql`ORDER BY "id" ASC`
      : Prisma.sql`ORDER BY "id" DESC`;
    const outerOrder = tab === "popular"
      ? Prisma.sql`ORDER BY p."id" ASC`
      : Prisma.sql`ORDER BY p."id" DESC`;

    const rows = await prisma.$queryRaw<Array<{ id: number; name: string; imageUrl: string | null; categoryId: string; rn: number }>>(
      Prisma.sql`
        SELECT p."id", p."name", p."imageUrl", c."categoryId",
               ROW_NUMBER() OVER (PARTITION BY c."categoryId" ${outerOrder}) AS rn
        FROM unnest(ARRAY[${Prisma.join(groupIds)}]::text[]) AS c("categoryId")
        CROSS JOIN LATERAL (
          SELECT "id", "name", "imageUrl"
          FROM "Product"
          WHERE "categoryId" = c."categoryId"
            -- The category filter is not the whole rule. A product can be
            -- adult by NAME while sitting in a perfectly ordinary category —
            -- that is the entire reason blockedNameRegex exists — and this
            -- query once applied neither it nor the blocked-id list, so the
            -- rankings page could feature a product no other surface shows.
            AND "name" !~* ${blockedNameRegex()}
            ${blockedIdsClause}
          ${innerOrder}
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
      .filter((g) => g.products.length > 0);

    return { scopeName, tab, groups, hasMore };
  },
  ["rankings-payload"],
  { revalidate: 60, tags: [TAG_CATEGORIES, TAG_PRODUCTS] }
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId"); // selected top-level category (optional)
    const tab = searchParams.get("tab") === "popular" ? "popular" : "hot";
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);
    const limit = Math.min(
      30,
      Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_GROUP_LIMIT), 10) || DEFAULT_GROUP_LIMIT)
    );

    const payload = await getCachedRankings(tab, offset, limit, parentId);
    // The edge cache in front of unstable_cache, for the same reason the
    // categories route has one: force-dynamic still wakes the function and
    // re-serialises the body for every caller.
    return NextResponse.json(payload, {
      headers: { "Cache-Control": MODERATION_SENSITIVE_CACHE_CONTROL },
    });
  } catch (error) {
    console.error("Failed to build rankings:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error", groups: [], hasMore: false },
      { status: 500 }
    );
  }
}
