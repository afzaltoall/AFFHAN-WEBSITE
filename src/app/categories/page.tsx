import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Product Categories Directory | Affhan Group",
  description:
    "Explore our complete product sourcing catalog. Filter by category, min order quantity (MOQ), origin hubs, and submit sourcing requests.",
  alternates: { canonical: "https://affhan.com/categories/" },
};

export default function CategoriesPage() {
  redirect("/products");
}
