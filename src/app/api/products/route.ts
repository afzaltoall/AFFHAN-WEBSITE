import { NextResponse } from "next/server";
import { Prisma } from ".prisma/client";
import { prisma } from "../../../lib/prisma";
import { unstable_cache } from "next/cache";
import { parseQuery, buildSearchWhere, buildSearchOrderBy, categoryNameMatches, buildFuzzyWhere, buildFuzzyOrderBy } from "@/lib/search";
import { blockedCategoryIdSet, blockedNameRegex, isCategoryBlocked, blockedProductIdList } from "@/lib/moderation";
import { MODERATION_SENSITIVE_CACHE_CONTROL } from "@/lib/cacheTags";

import { HeroProduct, MappedProduct, CategoryLite, getCachedProductCount, getCachedCategoryProductCount, getCachedAllCategories, getCachedPreferredCategories, getCachedDefaultHeroPool, shuffle, getHeroFeed } from "@/lib/products";

// Newest-first rows for a set of category ids, one index scan per category.
//
// The obvious query — `WHERE categoryId IN (...) ORDER BY id DESC LIMIT n` —
// is a trap at this table size. Postgres costs a backward walk of Product_pkey
// at ~23 for a LIMIT 4 (it assumes matches are spread evenly through the id
// range) and picks it over any categoryId index. But a category's products were
// all synced together, so they sit in one narrow id band, usually nowhere near
// the newest ids. Measured on "Computer & Office": 1,025,929 rows read and
// discarded to return 4, taking 4–12s. Adding (categoryId, id DESC) did not
// help on its own — the planner still preferred the backward scan.
//
// LATERAL removes the choice. Each category gets its own ordered index scan
// that stops after `take` rows, and the merge sorts at most take × categories.
// Same 14 homepage categories: worst case 10.1s -> 0.6s.
//
// Correctness for pagination: a row in the global newest `take` must also be
// within its own category's newest `take`, so taking `take` per category and
// re-sorting cannot miss one. Callers pass skip + limit as `take`.
function buildLateralRows(
  categoryIds: string[],
  take: number,
  extraWhere: Prisma.Sql[],
  descending: boolean,
): Prisma.Sql {
  const inner = extraWhere.length
    ? Prisma.sql`AND ${Prisma.join(extraWhere, " AND ")}`
    : Prisma.empty;
  const dir = descending ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  return Prisma.sql`
    SELECT x."id", x."name", x."imageUrl", x."category", x."categoryId"
    FROM unnest(ARRAY[${Prisma.join(categoryIds)}]::text[]) AS c(id)
    CROSS JOIN LATERAL (
      SELECT p."id", p."name", p."imageUrl", p."category", p."categoryId"
      FROM "Product" p
      WHERE p."categoryId" = c.id ${inner}
      ORDER BY p."id" ${dir}
      LIMIT ${take}
    ) x
    ORDER BY x."id" ${dir}
    LIMIT ${take}
  `;
}

// Beyond this many rows the per-category fan-out (take × categories) costs more
// than it saves, so deep pages fall back to the plain query.
const LATERAL_MAX_TAKE = 400;

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
    // Last resort: individual products whose problem is the photograph, which
    // neither the category name nor the product name can express. See
    // BLOCKED_PRODUCT_IDS.
    const blockedProductIds = blockedProductIdList();
    if (blockedProductIds) {
      moderationExclusion.push(Prisma.sql`p."id" NOT IN (${Prisma.join(blockedProductIds)})`);
    }

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

    // Set when browsing by category: the requested categories plus every
    // descendant, minus moderated ones. Kept out here so the LATERAL fast path
    // below can scan them one at a time.
    let browseCatIds: string[] | null = null;

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
      // Drop blocked categories here rather than carrying the NOT IN clause
      // into the LATERAL, where each scan is already pinned to one category.
      const blockedSet = blockedCategoryIdSet(allCats);
      browseCatIds = Array.from(descendantSet).filter((id) => !blockedSet.has(id));
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
    // This branch draws a fresh random sample per request, so its response is
    // the one thing here that must never be cached at the edge — a shared copy
    // would freeze one shuffle in place for everybody.
    const isRandomisedFeed = !hasFilters && page === 1 && sortBy !== "alpha" && sortBy !== "za" && sortBy !== "oldest";

    if (isRandomisedFeed) {
      const excludeParam = searchParams.get('excludeIds');
      const excludeIds = excludeParam ? excludeParam.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id)) : [];

      const result = await getHeroFeed(limit, excludeIds);
      products = result.products;
      total = result.total;
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

      // Plain category browsing — no text search, ordered by id — is the shape
      // the backward-pkey-scan trap bites (see buildLateralRows). It is also
      // the shape the app's home feed issues 14 times per open, so it gets the
      // per-category path. Everything else (search relevance, name ordering,
      // deep pages) keeps the straightforward query.
      const idOrdered = sortBy !== "alpha" && sortBy !== "za";
      const useLateral =
        browseCatIds !== null &&
        browseCatIds.length > 0 &&
        !pq.isValid &&
        idOrdered &&
        skip + limit <= LATERAL_MAX_TAKE;

      const rowsQuery = useLateral
        ? prisma
            .$queryRaw<Array<{ id: number; name: string; imageUrl: string | null; category: string | null; categoryId: string | null }>>(
              buildLateralRows(
                browseCatIds!,
                skip + limit,
                [
                  // moderationExclusion, not a hand-copied subset of it. This
                  // branch previously listed only the name regex, so a rule
                  // added to moderationExclusion silently did not apply to
                  // plain category browsing — which is the most common query
                  // the catalogue serves. The blocked-product-id rule was
                  // invisible here until this was fixed.
                  ...moderationExclusion,
                  ...(anchorId ? [Prisma.sql`p."id" <= ${parseInt(anchorId, 10)}`] : []),
                ],
                sortBy !== "oldest",
              )
            )
            // The LATERAL returns the global first skip+limit rows; drop the
            // pages already served to leave this one.
            .then((r) => r.slice(skip))
        : prisma.$queryRaw<Array<{ id: number; name: string; imageUrl: string | null; category: string | null; categoryId: string | null }>>(
            Prisma.sql`
              SELECT p."id", p."name", p."imageUrl", p."category", p."categoryId"
              FROM "Product" p
              ${whereSql}
              ORDER BY ${orderSql}
              LIMIT ${limit} OFFSET ${skip}
            `
          );

      // Plain category browsing gets the cached subtree count; anything with a
      // search or an anchor narrows the set further and must count for real.
      const countQuery: Promise<number> =
        browseCatIds !== null && browseCatIds.length > 0 && !pq.isValid && !anchorId
          ? getCachedCategoryProductCount(browseCatIds)
          : prisma
              .$queryRaw<Array<{ count: number }>>(countSql)
              .then((r) => Number(r[0]?.count ?? 0));

      // One round trip: page rows, (capped) count and facets in parallel.
      const [rows, countValue, facetRows] = await Promise.all([
        rowsQuery,
        countQuery,
        facetQuery,
      ]);

      products = rows.map((r: HeroProduct) => ({
        id: r.id,
        name: r.name,
        imageUrl: r.imageUrl,
        category: r.category,
        categoryRef: r.categoryId ? { name: catById.get(r.categoryId)?.name ?? null } : null
      }));
      total = isUnfilteredBrowse ? await getCachedProductCount() : countValue;
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

    // Everything except the shuffled feed is a pure function of the query
    // string over a catalogue the cron sync touches once a day, so let Vercel's
    // edge answer repeats without waking the function. The app's home feed
    // fires the same 14 category requests on every open; only the first of them
    // reaches Postgres.
    return NextResponse.json(
      {
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
      },
      {
        headers: {
          // Moderation-sensitive: this response is filtered by the blocked
          // category set and the blocked-name regex, so a stale edge copy is a
          // blocked product still on the site. See the note on the constant.
          "Cache-Control": isRandomisedFeed
            ? "no-store"
            : MODERATION_SENSITIVE_CACHE_CONTROL,
        },
      }
    );
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
