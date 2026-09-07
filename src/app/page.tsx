import type { Metadata } from "next";
import { FooterSection } from "@/components/sections/FooterSection";
import { MarketplaceHeroSection } from "@/components/sections/MarketplaceHeroSection";
import { PopularProductsSection } from "@/components/sections/PopularProductsSection";
import { ProductCategoriesSection } from "@/components/sections/ProductCategoriesSection";
import { ProductSpotlightSection } from "@/components/sections/ProductSpotlightSection";
import { GET as getProducts } from "@/app/api/products/route";
import { GET as getCategories } from "@/app/api/categories/route";
import { headers } from "next/headers";

export const metadata: Metadata = {
  alternates: { canonical: "https://affhan.com/" },
};

export default async function Home() {
  // Using direct calls to route handlers to prevent loopback requests
  // while utilizing their caching logic perfectly.
  const headersList = await headers();
  const host = headersList.get("host") || "localhost";
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  const [categoriesRes, productsRes] = await Promise.all([
    getCategories(),
    getProducts(new Request(`${baseUrl}/api/products?limit=140`)),
  ]);

  const categoriesJson = await categoriesRes.json();
  const productsJson = await productsRes.json();

  const initialCategories = categoriesJson.data || [];
  const initialProducts = productsJson.data || [];

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
