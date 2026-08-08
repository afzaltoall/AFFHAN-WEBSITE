import { NextResponse } from "next/server";
import { Prisma } from ".prisma/client";
import { prisma } from "../../../lib/prisma";
import { unstable_cache } from "next/cache";
import { isCategoryBlocked } from "@/lib/moderation";

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
  async (): Promise<CategoryLite[]> =>
    await prisma.category.findMany({
      select: { id: true, name: true, parentId: true, parentName: true, thumbnailUrl: true },
    }),
  ["all-categories-lite"],
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId"); // selected top-level category (optional)
    const tab = searchParams.get("tab") === "popular" ? "popular" : "hot";
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);
    const limit = Math.min(30, Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_GROUP_LIMIT), 10) || DEFAULT_GROUP_LIMIT));

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
    const scopedIds = leafCounts
      .filter((lc) => inScope(lc.categoryId) && catById.has(lc.categoryId) && !isCategoryBlocked(catById.get(lc.categoryId)!.name))
      .map((lc) => lc.categoryId);
    const groupIds = scopedIds.slice(offset, offset + limit);
    const hasMore = offset + limit < scopedIds.length;

    if (groupIds.length === 0) {
      return NextResponse.json({ scopeName, groups: [], hasMore: false });
    }

    // One windowed query: the top PRODUCTS_PER_GROUP products for every card,
    // interleaved. `hot` shows newest listings, `popular` shows the earliest
    // (established) ones — two honest, deterministic orderings.
    const orderInPartition = tab === "popular"
      ? Prisma.sql`ORDER BY "id" ASC`
      : Prisma.sql`ORDER BY "id" DESC`;

    const rows = await prisma.$queryRaw<Array<{ id: number; name: string; imageUrl: string | null; categoryId: string; rn: number }>>(
      Prisma.sql`
        SELECT "id", "name", "imageUrl", "categoryId", rn FROM (
          SELECT "id", "name", "imageUrl", "categoryId",
            ROW_NUMBER() OVER (PARTITION BY "categoryId" ${orderInPartition}) AS rn
          FROM "Product"
          WHERE "categoryId" IN (${Prisma.join(groupIds)})
        ) ranked
        WHERE rn <= ${PRODUCTS_PER_GROUP}
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

    return NextResponse.json({ scopeName, tab, groups, hasMore });
  } catch (error) {
    console.error("Failed to build rankings:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error", groups: [], hasMore: false },
      { status: 500 }
    );
  }
}
