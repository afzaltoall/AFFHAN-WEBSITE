import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { newSupplierTitle, renderNewSupplierPage } from "@/components/admin/NewSupplierPage";

export const dynamic = "force-dynamic";

/** The supplier's own name in the tab; the admin check repeated, as generateMetadata runs apart from the page. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const robots = { index: false, follow: false };
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return { title: "Affhan Admin", robots };
  return { title: await newSupplierTitle((await params).id), robots };
}

/**
 * A supplier's page, opened from Supplier Users (2026-10-23): the same page as /admin/new-suppliers/<id>/, with
 * Supplier Users as the way back and the row the rail lights. Admins only.
 */
export default async function SupplierUserPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");
  return renderNewSupplierPage((await params).id, "users");
}
