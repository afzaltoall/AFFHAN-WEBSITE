import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { drawBoard } from "@/lib/server/lucky-draw";
import { TRIP_FACTS } from "@/lib/trip-legal";
import { LuckyDrawBoard } from "@/components/admin/LuckyDrawBoard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lucky draw | Affhan Admin",
  robots: { index: false, follow: false },
};

/**
 * Free China Trip → Lucky draw (the owner, 2026-11-10): the five seats and who holds them, with every detail the team
 * needs to call them, the reserves, who was released and why; Draw, "can't take part" and Restore; the TV screen opened
 * from here, live or for a rehearsal. Both boards read here; the page then keeps itself up to date
 * (components/admin/LuckyDrawBoard.tsx).
 */
export default async function LuckyDrawPage() {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");
  const [live, rehearsal] = await Promise.all([drawBoard("live", true), drawBoard("rehearsal", true)]);
  return <LuckyDrawBoard live={live} rehearsal={rehearsal} closes={TRIP_FACTS.applicationsClose} />;
}
