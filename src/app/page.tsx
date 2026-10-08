import type { Metadata } from "next";
import { FooterSection } from "@/components/sections/FooterSection";
import { MarketplaceHeroSection } from "@/components/sections/MarketplaceHeroSection";
import { CategoryGridSection } from "@/components/sections/CategoryGridSection";
import { ProductCategoriesSection } from "@/components/sections/ProductCategoriesSection";
import { ProductSpotlightSection } from "@/components/sections/ProductSpotlightSection";
import { GET as getCategories } from "@/app/api/categories/route";
import { getHeroFeed } from "@/lib/products";
import { firstCards, getHomeGrid, getSpotlight } from "@/lib/homeGrid";
import { splitHeroPool, HOMEPAGE_PRODUCT_COUNT } from "@/lib/heroPool";
import { buildCategoryTree, type CategoryTreeNode } from "@/lib/categoryTree";
import { applicationWindow } from "@/lib/trip-application";
import { tripLock } from "@/lib/trip-lock";
import { ORG_ID, SITE_URL } from "@/lib/brand";

// Ten rows at the widest breakpoint (lg is 6 columns), so the grid still reads
// as "a lot of categories" without carrying all ~593 in the document. Defined
// here, on the server: it cannot be imported from the section, which is a
// client module.
const HOMEPAGE_CATEGORY_TILES = 60;

// WebSite, and it belongs here rather than in the root layout.
//
// The layout already publishes the Organization — who the company is. This is
// the other half Google looks for: what the site is, and how to search it. The
// SearchAction is what makes a sitelinks search box possible on a brand query,
// and it has to name a URL that actually works: the navbar search pushes to
// /products/?q=<term>, so that is the template.
//
// Homepage only, deliberately. WebSite describes the site as a whole, so one
// copy on the site's root URL is the whole point — repeating it on every page
// says nothing new and gives four hundred thousand URLs a claim to be the site.
const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  url: `${SITE_URL}/`,
  // WebSite.name and og:site_name are the SAME signal to Google — both feed
  // the site name shown above a result — so they cannot be allowed to
  // disagree, or Google picks between them on its own. og:site_name says
  // "AFFHAN" on every page that sets one, so this does too. All-caps is the
  // brand style again from 2026-09-29, reversing the title-case decision of
  // 2026-09-15; Dubai and Chennai had already gone back on 2026-09-21.
  //
  // Organization.name in the root layout reads AFFHAN International Pvt Ltd,
  // and alternateName below keeps the registered name attached to the site
  // itself.
  name: "AFFHAN",
  alternateName: "AFFHAN International Pvt Ltd",
  inLanguage: "en",
  publisher: { "@id": ORG_ID },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/products/?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

export const metadata: Metadata = {
  alternates: { canonical: "https://affhan.com/" },
};

// One minute, not an hour.
//
// The homepage's products are rotated on the server: getHeroFeed shuffles a
// 600-row cached pool and the result is baked into the ISR page, so the set
// only changes when this expires. At 3600 that meant the hero grid, the
// carousel and the spotlight showed the identical 90 products for a whole
// hour no matter how often the page was refreshed, which reads as broken
// rather than as caching.
//
// 60 keeps the page cached — the overwhelming majority of requests are still
// served from the edge without touching the database — while making the
// catalogue visibly alive. The cost is at most one regeneration a minute.
export const revalidate = 60;

export default async function Home() {
  const [categoriesRes, grid, spotlightOfTheDay, banner] = await Promise.all([
    getCategories(),
    // The category grid, and with it this week's picks (lib/homeGrid.ts): an hourly cache.
    // The homepage without it, never no homepage.
    getHomeGrid().catch((e) => {
      console.error("home grid failed", e);
      return [];
    }),
    // The spotlight band's family of the day (lib/homeGrid.ts). Likewise.
    getSpotlight().catch((e) => {
      console.error("home spotlight failed", e);
      return null;
    }),
    // The trip banner's lock. Locked if it cannot be read.
    tripLock(),
  ]);
  // Never the same product twice on one screen: the spotlight leaves out this week's picks, and
  // the hero's draw leaves out both.
  const picked = grid.flatMap((c) => (c.kind === "weekly" ? c.tiles.map((t) => t.id) : []));
  const fresh = <T extends { id: number }>(list: T[], n: number) => list.filter((p) => !picked.includes(p.id)).slice(0, n);
  const spotlight = spotlightOfTheDay && {
    ...spotlightOfTheDay,
    products: fresh(spotlightOfTheDay.products, 6),
    shelves: (() => {
      const full = spotlightOfTheDay.shelves.map((s) => ({ ...s, products: fresh(s.products, 4) })).filter((s) => s.products.length === 4);
      // Two or four, so their row is never half empty.
      return full.slice(0, full.length >= 4 ? 4 : full.length >= 2 ? 2 : 0);
    })(),
  };
  const productsResult = await getHeroFeed(
    // Exactly what the hero grid renders, and nothing else.
    //
    // This asked for 400 so the sections could reshuffle after hydration and
    // vary per refresh. 90 were drawn; the other 310 were serialised into the
    // RSC payload, downloaded, parsed and hydrated purely to be discarded —
    // about 174KB of the document.
    //
    // getHeroFeed already shuffles: it draws from a 600-row cached pool on
    // every call, so with revalidate = 3600 each regeneration picks a fresh 90
    // and everyone inside that hour sees the same set. The rotation moved to
    // the server; the variety stayed.
    HOMEPAGE_PRODUCT_COUNT,
    [...picked, ...(spotlight ? [...spotlight.products, ...spotlight.shelves.flatMap((s) => s.products)].map((p) => p.id) : [])],
  );

  const categoriesJson = await categoriesRes.json();
  const initialCategories = categoriesJson.data || [];
  const initialProducts = productsResult.products || [];

  const productCategories = initialCategories
    .filter((c: any) => c.thumbnailUrl && c.productCount > 0)
    .sort((a: any, b: any) => b.productCount - a.productCount);

  // The homepage used to hand the hero all 668 categories, because the
  // mega-panel needs the whole tree. At 386 bytes a row that was 252KB of the
  // 426KB RSC payload — serialised, shipped, parsed and hydrated on every
  // visit — for a panel that only exists after someone clicks "View All".
  //
  // Nothing above the fold needs more than two small slices of it:
  //
  //   the sidebar rail renders the top-level names, and
  //   the search box shows the eight biggest categories as shortcuts.
  //
  // Both are computed here. The full tree is fetched by the hero when the
  // browser is idle, or on demand if the panel is opened first.
  const sidebarCategories = buildCategoryTree(initialCategories).map((node: CategoryTreeNode) => ({
    id: node.id,
    name: node.name,
  }));

  const searchCategories = productCategories.slice(0, 8).map((c: any) => ({
    id: String(c.id),
    name: c.name,
    thumbnailUrl: c.thumbnailUrl ?? null,
    productCount: c.productCount,
  }));

  // The hero's slice of the pool. Three sections once carved the same array by
  // hard-coded index (hero 0..60, Popular 61..81, Spotlight 60..65), and the
  // last two overlapped the first, so a product could show up twice on one
  // screen. Now the hero is the pool's only reader: the grid and the spotlight
  // draw their own products, and the draw above leaves theirs out.
  const heroPool = splitHeroPool(initialProducts);

  return (
    <main className="w-full overflow-x-hidden scroll-smooth bg-slate-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <MarketplaceHeroSection
        initialProducts={heroPool.hero}
        sidebarCategories={sidebarCategories}
        searchCategories={searchCategories}
        // Whether the trip is taking applications as this render sees it, so
        // the trip banner's call is right on its first paint (it keeps
        // itself right after that). At most a minute old (revalidate).
        tripWindow={applicationWindow()}
        // Whether the banner is locked. An admin's unlock or lock
        // refreshes this page at once (revalidatePath, /api/admin/trip-lock/),
        // and a page that went out locked asks again by itself.
        tripLocked={banner.locked}
      />
      {/* The grid's first twelve columns only; the section reads the rest from /api/home-grid as they come near. */}
      <CategoryGridSection {...firstCards(grid)} />
      {/* Sliced here, not in the component. Handing it all ~600 and rendering
          60 still serialises all ~600 into the RSC payload, which is most of
          what took the homepage from 716KB to 1.45MB. The true count travels
          separately so the copy can still say how many there are. */}
      <ProductCategoriesSection
        initialCategories={productCategories.slice(0, HOMEPAGE_CATEGORY_TILES)}
        totalCount={productCategories.length}
      />
      <ProductSpotlightSection spotlight={spotlight} />
      <FooterSection />
    </main>
  );
}
