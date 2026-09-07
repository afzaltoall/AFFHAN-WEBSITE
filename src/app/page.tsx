import type { Metadata } from "next";
import { FooterSection } from "@/components/sections/FooterSection";
import { MarketplaceHeroSection } from "@/components/sections/MarketplaceHeroSection";
import { PopularProductsSection } from "@/components/sections/PopularProductsSection";
import { ProductCategoriesSection } from "@/components/sections/ProductCategoriesSection";
import { ProductSpotlightSection } from "@/components/sections/ProductSpotlightSection";

export const metadata: Metadata = {
  alternates: { canonical: "https://affhan.com/" },
};

export default function Home() {
  return (
    <main className="w-full overflow-x-hidden scroll-smooth bg-slate-50">
      <MarketplaceHeroSection />
      <PopularProductsSection />
      <ProductCategoriesSection />
      <ProductSpotlightSection />
      <FooterSection />
    </main>
  );
}
