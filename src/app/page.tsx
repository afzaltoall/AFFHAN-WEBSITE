import type { Metadata } from "next";
import { FooterSection } from "@/components/sections/FooterSection";
import { MarketplaceHeroSection } from "@/components/sections/MarketplaceHeroSection";
import { PopularProductsSection } from "@/components/sections/PopularProductsSection";
import { ProductCategoriesSection } from "@/components/sections/ProductCategoriesSection";
import { ProductSpotlightSection } from "@/components/sections/ProductSpotlightSection";
import { GET as getCategories } from "@/app/api/categories/route";
import { getHeroFeed } from "@/lib/products";
import { splitHeroPool } from "@/lib/heroPool";

export const metadata: Metadata = {
  alternates: { canonical: "https://affhan.com/" },
};

export const revalidate = 3600;

export default async function Home() {
  const [categoriesRes, productsResult] = await Promise.all([
    getCategories(),
    // A deliberately over-sized pool. Each section renders a fraction of its
    // own slice and reshuffles after hydration, and that headroom is what makes
    // one refresh look different from the last — 65 drawn from 240 varies,
    // 65 drawn from 70 does not.
    getHeroFeed(400),
  ]);

  const categoriesJson = await categoriesRes.json();
  const initialCategories = categoriesJson.data || [];
  const initialProducts = productsResult.products || [];

  const productCategories = initialCategories
    .filter((c: any) => c.thumbnailUrl && c.productCount > 0)
    .sort((a: any, b: any) => b.productCount - a.productCount);

  // Disjoint ranges, one per section. The three used to carve the same array by
  // hard-coded index (hero 0..60, Popular 61..81, Spotlight 60..65) — the last
  // two overlapped the first, so the same product could show up twice on one
  // screen. These ranges cannot overlap.
  const heroPool = splitHeroPool(initialProducts);

  return (
    <main className="w-full overflow-x-hidden scroll-smooth bg-slate-50">
      <MarketplaceHeroSection initialProducts={heroPool.hero} initialCategories={initialCategories} />
      <PopularProductsSection initialProducts={heroPool.popular} />
      <ProductCategoriesSection initialCategories={productCategories} />
      <ProductSpotlightSection initialProducts={heroPool.spotlight} />
      <FooterSection />
    </main>
  );
}
