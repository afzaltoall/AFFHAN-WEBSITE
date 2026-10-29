import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { TripApplicationsBoard } from "@/components/admin/TripApplicationsBoard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Free China Trip | Affhan Admin",
  robots: { index: false, follow: false },
};

/**
 * The Free China Business Trip: everyone who registered, with their account
 * and Trip ID (the rail's Free China Trip section), from /free-china-trip/apply/.
 * The board loads its own rows (/api/admin/trip-applications/), as the
 * dashboard's Shipping view does, so this page adds nothing to the console's
 * own load.
 *
 * The filters ride in the address (?tab=, ?journey=, ?country=, one each,
 * and ?view=again for Registered again), so a reload keeps them and a link
 * hands a colleague the same list. Read
 * here and handed down as the board's first state, as the suppliers page
 * does, rather than through useSearchParams.
 */
export default async function TripApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || "";
  return <TripApplicationsBoard initial={{ tab: one(params.tab), journey: one(params.journey), country: one(params.country), view: one(params.view) }} />;
}
