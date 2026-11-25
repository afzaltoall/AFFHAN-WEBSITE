import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { applicationWindow } from "@/lib/trip-application";
import { TRIP_FACTS } from "@/lib/trip-legal";
import { TripCountdownPreview } from "@/components/admin/TripCountdownPreview";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Countdown | Affhan Admin",
  robots: { index: false, follow: false },
};

/**
 * Free China Trip → Countdown (the owner, 2026-11-25: "in admin give access to see the preview of clock time before
 * 11.59 pm ... in admin itself i see a preview of it"): the page every trip page shows once applications close, as a
 * computer and a phone show it, live. Before the close only an admin can open it (proxy.ts), so this is where it is seen
 * ahead of time; after it, it is what everyone sees.
 */
export default async function TripCountdownPage() {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");
  return <TripCountdownPreview closed={applicationWindow() === "closed"} closes={TRIP_FACTS.applicationsClose} />;
}
