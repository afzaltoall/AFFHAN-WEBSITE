import type { Metadata } from "next";
import { FooterSection } from "@/components/sections/FooterSection";
import { MarketplaceHeroSection } from "@/components/sections/MarketplaceHeroSection";
import { PopularProductsSection } from "@/components/sections/PopularProductsSection";
import { ProductCategoriesSection } from "@/components/sections/ProductCategoriesSection";
import { ProductSpotlightSection } from "@/components/sections/ProductSpotlightSection";
import { GET as getCategories } from "@/app/api/categories/route";
import { getHeroFeed } from "@/lib/products";
import { splitHeroPool, HOMEPAGE_PRODUCT_COUNT } from "@/lib/heroPool";
import { buildCategoryTree, type CategoryTreeNode } from "@/lib/categoryTree";

// Ten rows at the widest breakpoint (lg is 6 columns), so the grid still reads
// as "a lot of categories" without carrying all ~593 in the document. Defined
// here, on the server: it cannot be imported from the section, which is a
// client module.
const HOMEPAGE_CATEGORY_TILES = 60;

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
  const [categoriesRes, productsResult] = await Promise.all([
    getCategories(),
    // Exactly what the three sections render, and nothing else.
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
    getHeroFeed(HOMEPAGE_PRODUCT_COUNT),
  ]);

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

  // Disjoint ranges, one per section. The three used to carve the same array by
  // hard-coded index (hero 0..60, Popular 61..81, Spotlight 60..65) — the last
  // two overlapped the first, so the same product could show up twice on one
  // screen. These ranges cannot overlap.
  const heroPool = splitHeroPool(initialProducts);

  return (
    <main className="w-full overflow-x-hidden scroll-smooth bg-slate-50">
      <MarketplaceHeroSection
        initialProducts={heroPool.hero}
        sidebarCategories={sidebarCategories}
        searchCategories={searchCategories}
      />
      <PopularProductsSection initialProducts={heroPool.popular} />
      {/* Sliced here, not in the component. Handing it all ~600 and rendering
          60 still serialises all ~600 into the RSC payload, which is most of
          what took the homepage from 716KB to 1.45MB. The true count travels
          separately so the copy can still say how many there are. */}
      <ProductCategoriesSection
        initialCategories={productCategories.slice(0, HOMEPAGE_CATEGORY_TILES)}
        totalCount={productCategories.length}
      />
      <ProductSpotlightSection initialProducts={heroPool.spotlight} />
      <FooterSection />
    </main>
  );
}
