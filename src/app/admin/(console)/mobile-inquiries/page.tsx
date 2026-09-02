import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { MobileInquiriesConsole } from "@/components/admin/MobileInquiriesConsole";

export const metadata: Metadata = {
  title: "App Inquiries",
};

export const dynamic = "force-dynamic";

/**
 * Inquiries raised in the mobile app, worked separately from the website's
 * quote form on the main console. Different customers (they have accounts),
 * different status vocabulary, and a quantity the customer can keep revising
 * after submitting — none of which the existing inquiry cards model.
 *
 * Guarded here rather than in the client component so an unauthenticated
 * visitor is redirected before any of it renders, matching /admin.
 */
export default async function MobileInquiriesPage() {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");

  return <MobileInquiriesConsole />;
}
