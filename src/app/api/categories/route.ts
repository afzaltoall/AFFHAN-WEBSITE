import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { Category } from ".prisma/client";
import { blockedCategoryIdSet } from "@/lib/moderation";
import { TAG_CATEGORIES, TAG_PRODUCTS, MODERATION_SENSITIVE_CACHE_CONTROL } from "@/lib/cacheTags";
import { cachedOnce } from "@/lib/cachedOnce";
import { sumProductCounts } from "@/lib/categoryCounts";
import { readSnapshotNow } from "@/lib/snapshotStore";

export const dynamic = "force-dynamic";

const getCachedCategories = cachedOnce(
  async (): Promise<{ data: Category[]; totalCount: number }> => {
    // productCount is a column, refreshed daily (lib/snapshots.ts), so this is
    // a read of the category table. It used to count every category's
    // products on each miss (Prisma's _count, a GROUP BY over a million rows,
    // about a second) and then the whole table again for totalCount.
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' } });

    // Drop moderation-blocked categories (and every descendant of a blocked
    // parent) so they never appear in the mega-menu, catalog tree, rankings
    // scope or search facets.
    const blocked = blockedCategoryIdSet(categories);
    const formattedCategories = categories.filter((cat) => !blocked.has(cat.id));

    // The app's catalogue screen reads it (catalog_screen.dart): the refresh's total of what the site
    // shows, read directly rather than through getCachedProductCount's own cache, since this one is
    // cached already (lib/snapshotStore.ts, readSnapshotNow); before a refresh, the categories' sum.
    const total =
      (await readSnapshotNow<number>("catalogue-total", "current")) ??
      sumProductCounts(formattedCategories, formattedCategories.map((c) => c.id));
    return { data: formattedCategories, totalCount: total };
  },
  ["categories-api-data"],
  { revalidate: 3600, tags: [TAG_CATEGORIES, TAG_PRODUCTS] }
);

export async function GET() {
  // Retry the transient concurrent-cache race (see products route) before 500.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const cached = await getCachedCategories();
      // The unstable_cache above already spares Postgres, but with
      // force-dynamic the function still wakes and re-serialises ~180KB for
      // every caller, so the edge is still worth having in front of it.
      //
      // It used to hold for an hour and then serve stale for a further day.
      // That was written when the taxonomy was CJ's 634 fixed nodes and the
      // only thing that changed was thumbnails. Neither is true now: categories
      // are merged and deleted here, and — the reason this is short rather than
      // merely shorter — a category can need blocking on content-safety
      // grounds, which has happened once already.
      return NextResponse.json(
        {
          success: true,
          data: cached.data,
          totalCount: cached.totalCount,
        },
        {
          headers: {
            "Cache-Control": MODERATION_SENSITIVE_CACHE_CONTROL,
          },
        }
      );
    } catch (error: unknown) {
      lastError = error;
      console.error(`Failed to fetch categories (attempt ${attempt + 1}/3):`, error);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 120 * (attempt + 1)));
        continue;
      }
    }
  }
  console.error("Categories request failed after retries:", lastError);
  return NextResponse.json(
    { success: false, error: "Internal Server Error", data: [], totalCount: 0 },
    { status: 500 }
  );
}
