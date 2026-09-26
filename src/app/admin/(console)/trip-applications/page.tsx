import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { TripApplicationsBoard } from "@/components/admin/TripApplicationsBoard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trip applications | Affhan Admin",
  robots: { index: false, follow: false },
};

/**
 * Applications for the free China business trip, from /free-china-trip/apply/.
 * The board loads its own rows (/api/admin/trip-applications/), as the
 * dashboard's Shipping view does, so this page adds nothing to the console's
 * own load.
 */
export default async function TripApplicationsPage() {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");
  return <TripApplicationsBoard />;
}
