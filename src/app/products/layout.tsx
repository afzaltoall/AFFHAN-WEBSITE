import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Product Catalog | Affhan Group",
  description:
    "Browse Affhan's global sourcing catalog across hundreds of categories. Find a product like what you need and request a quote — we source, QC and ship it.",
};

export default function ProductsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
