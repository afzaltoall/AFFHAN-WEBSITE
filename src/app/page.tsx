import type { Metadata } from "next";
import { FooterSection } from "@/components/sections/FooterSection";
import { MarketplaceHeroSection } from "@/components/sections/MarketplaceHeroSection";
import { PopularProductsSection } from "@/components/sections/PopularProductsSection";
import { ProductCategoriesSection } from "@/components/sections/ProductCategoriesSection";
import { ProductSpotlightSection } from "@/components/sections/ProductSpotlightSection";
import { GET as getCategories } from "@/app/api/categories/route";
import { getHeroFeed } from "@/lib/products";

export const metadata: Metadata = {
  alternates: { canonical: "https://affhan.com/" },
};

export const revalidate = 3600;

export default async function Home() {
  const [categoriesRes, productsResult] = await Promise.all([
    getCategories(),
    getHeroFeed(140),
  ]);

  const categoriesJson = await categoriesRes.json();
  const initialCategories = categoriesJson.data || [];
  const initialProducts = productsResult.products || [];

  const productCategories = initialCategories
    .filter((c: any) => c.thumbnailUrl && c.productCount > 0)
    .sort((a: any, b: any) => b.productCount - a.productCount);

  return (
    <main className="w-full overflow-x-hidden scroll-smooth bg-slate-50">
      <MarketplaceHeroSection initialProducts={initialProducts} initialCategories={initialCategories} />
      <PopularProductsSection initialProducts={initialProducts} />
      <ProductCategoriesSection initialCategories={productCategories} />
      <ProductSpotlightSection initialProducts={initialProducts} />
      <FooterSection />
    </main>
  );
}
