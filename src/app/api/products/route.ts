import { NextResponse } from "next/server";
import { Prisma } from ".prisma/client";
import { prisma } from "../../../lib/prisma";
import { unstable_cache } from "next/cache";
import { parseQuery, buildSearchWhere, buildSearchOrderBy, categoryNameMatches, buildFuzzyWhere, buildFuzzyOrderBy } from "@/lib/search";
import { blockedCategoryIdSet, blockedNameRegex, isCategoryBlocked } from "@/lib/moderation";

type HeroProduct = {
  id: number;
  name: string;
  imageUrl: string | null;
  category: string | null;
  categoryId: string | null;
};

type MappedProduct = {
  id: number;
  name: string;
  imageUrl: string | null;
  category: string | null;
  categoryRef: { name: string | null } | null;
};

import { getCdnUrl } from "@/lib/cdn";

const getCachedProductCount = unstable_cache(
  async (): Promise<number> => await prisma.product.count(),
  ["total-product-count"],
  { revalidate: 3600 }
);

type CategoryLite = { id: string; name: string; parentId: string | null; parentName: string | null; thumbnailUrl: string | null };

// The whole category table is small (~600 rows) and rarely changes, so we load
// it once (cached) and do all category work — descendant expansion, resolving
// which categories a search matches, mapping ids→names for display/facets — in
// memory. This keeps the search SQL join-free so the FTS index stays usable.
const getCachedAllCategories = unstable_cache(
  async (): Promise<CategoryLite[]> => {
    const cats = await prisma.category.findMany({
      select: { id: true, name: true, parentId: true, parentName: true, thumbnailUrl: true },
    });
    return cats.map(c => ({ ...c, thumbnailUrl: getCdnUrl(c.thumbnailUrl) }));
  },
  ["all-categories-lite-v3"],
  { revalidate: 3600 }
);

const getCachedPreferredCategories = unstable_cache(
  async (): Promise<string[]> => {
    const PREFERRED_TOP_NAMES = [
      "Computer & Office",
      "Consumer Electronics",
      "Home Improvement",
      "Automobiles & Motorcycles", // cars, bikes
      "Pet Supplies",
      "Home, Garden & Furniture", // home items, kitchens, lights
      "Sports & Outdoors", // gym, bicycle
      "Toys, Kids & Babies", // costumes, novelty
      "Men's Clothing",
    ];
    const allCategories: Array<{ id: string; name: string; parentId: string | null }> = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
    const nameById = new Map(allCategories.map(c => [c.id, c.name]));
    const childrenMap = new Map<string, string[]>();
    for (const c of allCategories) {
      if (c.parentId) {
        if (!childrenMap.has(c.parentId)) childrenMap.set(c.parentId, []);
        childrenMap.get(c.parentId)!.push(c.id);
      }
    }
    const preferredTopIds = allCategories
      .filter(c => !c.parentId && PREFERRED_TOP_NAMES.includes(c.name))
      .map(c => c.id);
    const sourceCatSet = new Set<string>();
    const queue = [...preferredTopIds];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      // Skip moderated (18+) categories AND their whole subtree — these must
      // never surface on the homepage feed, same as everywhere else on the site.
      if (isCategoryBlocked(nameById.get(curr))) continue;
      sourceCatSet.add(curr);
      for (const child of childrenMap.get(curr) ?? []) queue.push(child);
    }
    return Array.from(sourceCatSet);
  },
  ["preferred-category-ids-v6"],
  { revalidate: 3600 }
);

// A big, diverse POOL of homepage-eligible products (several newest per leaf
// across the preferred categories). Cached because it's the same set for an
// hour; the ROUTE then draws a fresh RANDOM sample from it per request so the
// homepage hero / trending / spotlight show different products on every refresh.
const getCachedDefaultHeroPool = unstable_cache(
  async (sourceCatIds: string[]): Promise<HeroProduct[]> => {
    return await prisma.$queryRaw<Array<{ id: number; name: string; imageUrl: string | null; category: string | null; categoryId: string | null }>>(
      Prisma.sql`
        SELECT "id", "name", "imageUrl", "category", "categoryId" FROM (
          SELECT "id", "name", "imageUrl", "category", "categoryId",
            ROW_NUMBER() OVER (PARTITION BY "categoryId" ORDER BY "id" DESC) as rn
          FROM "Product"
          WHERE "categoryId" IN (${Prisma.join(sourceCatIds)})
            AND "name" !~* ${blockedNameRegex()}
            AND "imageUrl" IS NOT NULL
        ) ranked
        WHERE rn <= 6
        ORDER BY rn ASC, "categoryId" ASC
        LIMIT 600
      `
    );
  },
  ["default-hero-pool-v1"],
  { revalidate: 3600 }
);

// Fisher-Yates shuffle (returns a new array) — used to randomize the homepage
// feed per request so refreshes show variety.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // A burst of concurrent requests hitting cold `unstable_cache` entries can
  // race its (de)serialization and throw "Unexpected end of JSON input". A
  // sequential request always succeeds, so we retry a couple of times with a
  // short backoff before surfacing a 500 — this self-heals the transient race.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const category = searchParams.get("category");
    const categoryId = searchParams.get("categoryId");
    const sortBy = searchParams.get("sortBy");
    const getChips = searchParams.get("getChips");

    // Pagination params
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "40", 10);
    const skip = (page - 1) * limit;

    const anchorId = searchParams.get("anchorId");

    // Shared search core (src/lib/search.ts): FTS on the product name (stemmed,
    // GIN-indexed) OR a categoryId match, with phrase/prefix/category relevance
    // boosts. The homepage hero, navbar autocomplete and this grid all rank
    // through the same code so results can never disagree.
    const pq = parseQuery(query);

    // Load the (small) category table once; do all category work in memory so
    // the search SQL stays join-free and the FTS index remains usable.
    const allCats = await getCachedAllCategories();
    const catById = new Map(allCats.map((c) => [c.id, c]));

    // Moderation: products in these (adult-imagery) categories are hidden from
    // every product query. NULL-categoryId products are kept (they aren't in a
    // blocked category). Applied only in the filtered/browse branch below —
    // the homepage hero draws solely from clean "preferred" categories.
    const blockedIds = Array.from(blockedCategoryIdSet(allCats));
    const moderationExclusion: Prisma.Sql[] = [];
    if (blockedIds.length) {
      moderationExclusion.push(Prisma.sql`(p."categoryId" IS NULL OR p."categoryId" NOT IN (${Prisma.join(blockedIds)}))`);
    }
    // Also drop adult-named products that slipped into other categories.
    moderationExclusion.push(Prisma.sql`p."name" !~* ${blockedNameRegex()}`);

    // Resolve which categories the text matches (name contains every word) —
    // fed to the core as categoryIds so a "bags" search returns every product
    // in a Bags category, without a SQL join.
    const matchedCatIds = pq.isValid
      ? allCats.filter((c) => categoryNameMatches(c.name, pq)).map((c) => c.id)
      : [];
    const searchOpts = { categoryIds: matchedCatIds };

    // All conditions reference ONLY the Product `p`.
    // conditions       = final filtered query (search + category + anchor)
    // facetConditions  = search + anchor only (NO active-category filter), so
    //   the "narrow by category" chips reflect the whole search, not the slice
    //   the user has already drilled into.
    const conditions: Prisma.Sql[] = [];
    const facetConditions: Prisma.Sql[] = [];

    if (anchorId) {
      const anchor = Prisma.sql`p."id" <= ${parseInt(anchorId, 10)}`;
      conditions.push(anchor);
      facetConditions.push(anchor);
    }

    if (pq.isValid) {
      const searchCond = buildSearchWhere(pq, searchOpts);
      conditions.push(searchCond);
      facetConditions.push(searchCond);
    }

    if (categoryId) {
      const targetCatIds = categoryId.includes(",") ? categoryId.split(",") : [categoryId];

      // Expand each requested category to all its descendants (products attach
      // only to leaves) using the in-memory adjacency list.
      const childrenMap = new Map<string, string[]>();
      for (const cat of allCats) {
        if (cat.parentId) {
          if (!childrenMap.has(cat.parentId)) childrenMap.set(cat.parentId, []);
          childrenMap.get(cat.parentId)!.push(cat.id);
        }
      }
      const descendantSet = new Set<string>(targetCatIds);
      const queue = [...targetCatIds];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        for (const child of childrenMap.get(curr) ?? []) {
          if (!descendantSet.has(child)) {
            descendantSet.add(child);
            queue.push(child);
          }
        }
      }
      conditions.push(Prisma.sql`p."categoryId" IN (${Prisma.join(Array.from(descendantSet))})`);
    } else if (category) {
      conditions.push(Prisma.sql`p."category" ILIKE ${"%" + category + "%"}`);
    }

    const hasFilters = conditions.length > 0;

    // Base sort. When searching, the core prepends a relevance score so the
    // most relevant products lead regardless of recency.
    const baseOrderSql =
      sortBy === "alpha" ? Prisma.sql`p."name" ASC, p."id" DESC`
      : sortBy === "za" ? Prisma.sql`p."name" DESC, p."id" DESC`
      : sortBy === "oldest" ? Prisma.sql`p."id" ASC`
      : Prisma.sql`p."id" DESC`; // "newest" / default
    const orderSql = pq.isValid ? buildSearchOrderBy(pq, baseOrderSql, searchOpts) : baseOrderSql;

    let products: MappedProduct[] = [];
    let total = 0;
    let totalCapped = false;
    let facets: Array<{ id: string; name: string; parentName: string | null; thumbnailUrl: string | null; count: number }> = [];

    // Homepage hero (no filters, page 1 only) -> a diverse mix drawn ONLY
    // from these 5 preferred top-level categories. Fixed (not re-randomized
    // every call) and a single windowed query (not N per-category round
    // trips). Load-more reuses this branch (excludeIds strips shown items).
    // `sortBy=alpha` (the full catalogue's A–Z view) opts OUT of this diverse
    // feed and falls through to the deterministic, name-ordered browse branch
    // so the whole catalogue truly starts at A.
    if (!hasFilters && page === 1 && sortBy !== "alpha" && sortBy !== "za" && sortBy !== "oldest") {
      const excludeParam = searchParams.get('excludeIds');
      const excludeIds = excludeParam ? excludeParam.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id)) : [];

      const sourceCatIds = await getCachedPreferredCategories();

      if (sourceCatIds.length > 0) {
        // Draw a fresh RANDOM sample from the cached diverse pool on every
        // request, so the homepage hero / trending / spotlight show different
        // products each refresh. excludeIds (used by any load-more) are removed
        // first so nothing already shown repeats.
        const pool = await getCachedDefaultHeroPool(sourceCatIds);
        const exclude = new Set(excludeIds);
        const available = exclude.size ? pool.filter((r) => !exclude.has(r.id)) : pool;
        const rows: HeroProduct[] = shuffle(available).slice(0, limit);

        const catIds = Array.from(new Set(rows.map(r => r.categoryId).filter(Boolean))) as string[];
        const cats = catIds.length > 0
          ? await prisma.category.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } })
          : [];
        const catNameById = new Map<string, string | null>(cats.map((c: { id: string; name: string }) => [c.id, c.name as string | null]));

        products = rows.map((r: HeroProduct) => ({
          id: r.id,
          name: r.name,
          imageUrl: r.imageUrl,
          category: r.category,
          categoryRef: r.categoryId ? { name: catNameById.get(r.categoryId as string) || null } : null
        }));
      }

      total = await getCachedProductCount();
    } else {
      // Deterministic, real-offset query — used for every filtered request
      // (search / category / anchor) AND for unfiltered browsing past page 1,
      // so numbered pagination returns stable pages. JOIN-FREE: all conditions
      // reference only Product `p`, which keeps the FTS GIN index usable (a
      // Category join here dropped search from ~300ms to ~3s).
      // Fold the moderation exclusion into every query in this branch (it also
      // covers unfiltered page 2+ browsing, which has no other conditions).
      const browseConds = [...conditions, ...moderationExclusion];
      const whereSql = browseConds.length ? Prisma.sql`WHERE ${Prisma.join(browseConds, " AND ")}` : Prisma.empty;

      // For a text search, counting every matching row across 600k+ products is
      // slow and nobody paginates past ~20 pages anyway, so we cap the count:
      // count up to SEARCH_COUNT_CAP and, if we hit it, report "cap+". Category
      // browsing keeps the exact count (categoryId is indexed and cheap).
      const SEARCH_COUNT_CAP = 1000;
      // Unfiltered browse (the A–Z full catalogue, page 2+, etc.) would
      // otherwise pay a full COUNT with the moderation regex over 600k+ rows
      // (~4s). The grand total barely moves, so reuse the cached count instead.
      const isUnfilteredBrowse = conditions.length === 0 && !pq.isValid;
      const countSql = pq.isValid
        ? Prisma.sql`SELECT COUNT(*)::int AS count FROM (SELECT 1 FROM "Product" p ${whereSql} LIMIT ${SEARCH_COUNT_CAP}) x`
        : isUnfilteredBrowse
        ? Prisma.sql`SELECT 0::int AS count`
        : Prisma.sql`SELECT COUNT(*)::int AS count FROM "Product" p ${whereSql}`;

      // Category facets ("narrow by category" chips) for the search-results UI,
      // over the search only (ignoring the active category) so users can pivot
      // across every category the query hit — like Alibaba's category rail.
      // Grouped by categoryId over a bounded SAMPLE of matches (names resolved
      // in memory afterwards) so a broad query like "bags" doesn't pay a
      // multi-second GROUP BY; category ORDERING stays stable.
      const wantFacets = Boolean(getChips && pq.isValid && facetConditions.length > 0);
      const facetConds = [...facetConditions, ...moderationExclusion];
      const facetWhere = wantFacets ? Prisma.sql`WHERE ${Prisma.join(facetConds, " AND ")}` : Prisma.empty;
      const FACET_SAMPLE = 4000;
      const facetQuery = wantFacets
        ? prisma.$queryRaw<Array<{ categoryId: string | null; count: number }>>(
            Prisma.sql`
              SELECT s."categoryId", COUNT(*)::int AS count
              FROM (SELECT p."categoryId" FROM "Product" p ${facetWhere} LIMIT ${FACET_SAMPLE}) s
              WHERE s."categoryId" IS NOT NULL
              GROUP BY s."categoryId"
              ORDER BY count DESC
              LIMIT 18
            `
          )
        : Promise.resolve([]);

      // One round trip: page rows, (capped) count and facets in parallel.
      const [rows, countRows, facetRows] = await Promise.all([
        prisma.$queryRaw<Array<{ id: number; name: string; imageUrl: string | null; category: string | null; categoryId: string | null }>>(
          Prisma.sql`
            SELECT p."id", p."name", p."imageUrl", p."category", p."categoryId"
            FROM "Product" p
            ${whereSql}
            ORDER BY ${orderSql}
            LIMIT ${limit} OFFSET ${skip}
          `
        ),
        prisma.$queryRaw<Array<{ count: number }>>(countSql),
        facetQuery,
      ]);

      products = rows.map((r: HeroProduct) => ({
        id: r.id,
        name: r.name,
        imageUrl: r.imageUrl,
        category: r.category,
        categoryRef: r.categoryId ? { name: catById.get(r.categoryId)?.name ?? null } : null
      }));
      total = isUnfilteredBrowse ? await getCachedProductCount() : Number(countRows[0]?.count ?? 0);
      totalCapped = pq.isValid && total >= SEARCH_COUNT_CAP;

      facets = facetRows
        .map((f) => ({ id: f.categoryId, cat: f.categoryId ? catById.get(f.categoryId) : undefined, count: Number(f.count) }))
        .filter((f): f is { id: string; cat: CategoryLite; count: number } => Boolean(f.id && f.cat))
        .map((f) => ({ id: f.id, name: f.cat.name, parentName: f.cat.parentName, thumbnailUrl: f.cat.thumbnailUrl, count: f.count }));

      // Typo-tolerant fallback: an exact search that finds nothing (e.g. "iphn
      // cabel") retries with pg_trgm fuzzy matching so the shopper still gets
      // close results instead of an empty page. Only on page 1, so pagination
      // stays coherent.
      if (products.length === 0 && pq.isValid && page === 1) {
        const fuzzyWhere = Prisma.sql`WHERE ${Prisma.join([buildFuzzyWhere(pq), ...moderationExclusion], " AND ")}`;
        const fuzzyRows = await prisma.$queryRaw<Array<{ id: number; name: string; imageUrl: string | null; category: string | null; categoryId: string | null }>>(
          Prisma.sql`
            SELECT p."id", p."name", p."imageUrl", p."category", p."categoryId"
            FROM "Product" p
            ${fuzzyWhere}
            ORDER BY ${buildFuzzyOrderBy(pq)}
            LIMIT ${limit}
          `
        );
        products = fuzzyRows.map((r) => ({
          id: r.id,
          name: r.name,
          imageUrl: r.imageUrl,
          category: r.category,
          categoryRef: r.categoryId ? { name: catById.get(r.categoryId)?.name ?? null } : null,
        }));
        total = products.length;
      }
    }

    return NextResponse.json({
      success: true,
      data: products,
      facets,
      pagination: {
        total,
        totalCapped,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
    } catch (error: unknown) {
      lastError = error;
      console.error(`Failed to fetch products (attempt ${attempt + 1}/3):`, error);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 120 * (attempt + 1)));
        continue;
      }
    }
  }

  // All retries exhausted — return JSON (not plain text) with safe empty
  // defaults so clients that call res.json() unconditionally never throw
  // "Unexpected token 'I'… is not valid JSON".
  console.error("Products request failed after retries:", lastError);
  return NextResponse.json(
    {
      success: false,
      error: "Internal Server Error",
      data: [],
      facets: [],
      pagination: { total: 0, totalCapped: false, page: 1, limit: 0, totalPages: 1 },
    },
    { status: 500 }
  );
}
