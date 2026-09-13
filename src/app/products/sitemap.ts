import type { MetadataRoute } from "next";
import { Prisma } from ".prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { blockedCategoryIdSet, blockedNameRegex } from "@/lib/moderation";
import { TAG_CATEGORIES, TAG_PRODUCTS } from "@/lib/cacheTags";

// ---------------------------------------------------------------------------
// Product-page sitemap — EPROLO listings only, deliberately.
//
// The catalogue holds 1,079,241 products and this submits about 12,000 of
// them. That is the point, not an oversight.
//
// A product page was measured at 69% boilerplate: of 280 distinct words, 193
// appear on every other product page too, leaving ~87 that are actually about
// the product — and for a CJ listing those 87 are the name and the category
// path, nothing else. CJ sends no description at all: 1,067,069 rows, zero
// descriptions. The same feed is carried by thousands of other dropshipping
// sites, so submitting a million near-identical pages is a site-wide quality
// signal rather than a million chances to rank, on a site that otherwise has
// seventeen real pages.
//
// EPROLO is the exception and the reason this file exists: all 12,172 of its
// rows carry a description, 12,159 of them over 200 characters, and
// src/lib/productDescription.ts parses those into real specs and size charts
// that appear on the page. Those pages have something to say.
//
// If CJ ever gains descriptions, widen the filter below rather than adding a
// second sitemap — generateSitemaps already shards at Google's 50,000-URL
// limit, so growth costs nothing structurally.
// ---------------------------------------------------------------------------

// Generated on request and cached, NOT prerendered at build.
//
// The first attempt used generateSitemaps() and shipped an empty <urlset>:
// the build ran the query against Neon, the connection failed the way it
// intermittently does from this network, and a sitemap that is baked at build
// time has no second chance — it stays empty until the next deploy. A
// sitemap whose contents depend on a database the build may not reach should
// not be a build artefact.
//
// revalidate keeps it cheap: one query a day, served from cache in between,
// which suits a catalogue that changes on a daily cron.
export const revalidate = 86_400;

// Sharding is deliberately absent. There are ~12,145 urls, comfortably inside
// Google's 50,000-per-file limit, and one file at the address robots.txt
// already advertises is simpler than an index nobody needs yet. If EPROLO's
// share ever approaches the cap, reintroduce generateSitemaps() here — but
// make it dynamic, for the reason above.
const SITEMAP_URL_CAP = 50_000;

/**
 * Ids of every product worth submitting, in a stable order.
 *
 * Four exclusions, matching what the rest of the site already hides:
 *
 *   ModerationLog — the authoritative record of things removed by hand. 3,167
 *     of its rows still exist in Product (2,646 blocked-category, 467
 *     duplicate-name, 54 mens-women-mismatch), and no read path consults this
 *     table, so a sitemap built without this join would advertise pages that
 *     were explicitly taken down.
 *   blocked categories — descendant-aware, so blocking a parent hides its
 *     leaves; products attach only to leaves.
 *   the blocked-name regex — a product can be adult by name while sitting in
 *     an ordinary category.
 *   missing description — the whole basis for including a product at all.
 */
const getSitemapProductIds = unstable_cache(
  async (): Promise<number[]> => {
    const cats = await prisma.category.findMany({ select: { id: true, name: true, parentId: true } });
    const blocked = blockedCategoryIdSet(cats);

    // Prisma.join refuses an empty list, and `NOT IN ()` is a syntax error in
    // Postgres, so the clause has to disappear when nothing is blocked.
    const blockedCatsClause = blocked.size
      ? Prisma.sql`AND p."categoryId" NOT IN (${Prisma.join([...blocked])})`
      : Prisma.empty;

    const rows = await prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      SELECT p."id"
      FROM "Product" p
      WHERE p."supplierSource" = 'EPROLO'
        AND p."description" IS NOT NULL
        AND length(p."description") > 200
        AND p."name" !~* ${blockedNameRegex()}
        ${blockedCatsClause}
        AND NOT EXISTS (
          SELECT 1 FROM "ModerationLog" m WHERE m."cjPid" = p."cjPid"
        )
      ORDER BY p."id" ASC
    `);
    return rows.map((r) => r.id);
  },
  ["sitemap-product-ids"],
  { revalidate: 86_400, tags: [TAG_CATEGORIES, TAG_PRODUCTS] }
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const ids = await getSitemapProductIds();

  // Truncate rather than emit an oversized file. A sitemap over the limit is
  // rejected wholesale by Google, so losing the tail beats losing all of it —
  // and the slice is a signal to come back and shard.
  const included = ids.slice(0, SITEMAP_URL_CAP);

  // The trailing slash is load-bearing: next.config sets trailingSlash: true,
  // so a URL without one answers 308 and every crawl of it is spent on a
  // redirect instead of on the page.
  return included.map((productId) => ({
    url: `https://affhan.com/products/${productId}/`,
    lastModified: new Date(),
    changeFrequency: "monthly" as const,
    // Below the static pages (0.7-1.0). These are catalogue listings, not the
    // pages the business wants to rank for.
    priority: 0.5,
  }));
}
