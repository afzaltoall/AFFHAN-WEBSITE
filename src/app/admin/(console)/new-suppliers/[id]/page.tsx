import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { newSupplierTitle, renderNewSupplierPage } from "@/components/admin/NewSupplierPage";

export const dynamic = "force-dynamic";

/**
 * The supplier's own name in the tab title, as Old Suppliers' pages have it: several are open at once while the
 * team chases them. The admin check is repeated here because generateMetadata runs apart from the page, and
 * without it an unsigned request would be handed the supplier's name in <title>.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const robots = { index: false, follow: false };
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return { title: "Affhan Admin", robots };
  return { title: await newSupplierTitle((await params).id), robots };
}

/** A new supplier's page, opened from New Suppliers (NewSupplierPage.tsx renders it). Admins only. */
export default async function NewSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");
  return renderNewSupplierPage((await params).id, "new-suppliers");
}
