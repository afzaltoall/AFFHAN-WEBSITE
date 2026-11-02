import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { employeeReferrals, referralBoard } from "@/lib/server/trip-referrals";
import { TripReferralsBoard } from "@/components/admin/TripReferralsBoard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Employee tasks | Affhan Admin",
  robots: { index: false, follow: false },
};

/**
 * Free China Trip → Employee tasks (the owner, 2026-11-02): the referral task's settings, every employee's code and
 * how far they have got, and, with ?employee=<id>, that employee's applications to count or decline and their
 * payments. Read here on every request; the board's buttons write through /api/admin/trip-referrals/ and read again.
 */
export default async function TripReferralsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");
  const params = await searchParams;
  const wanted = Array.isArray(params.employee) ? params.employee[0] : params.employee;
  const { settings, rows } = await referralBoard();
  const pick = wanted ? rows.find((r) => r.employeeId === wanted) ?? null : null;
  const detail = pick ? { employeeId: pick.employeeId, name: pick.name, isActive: pick.isActive, ...(await employeeReferrals({ id: pick.employeeId, name: pick.name })) } : null;
  return <TripReferralsBoard settings={settings} rows={rows} detail={detail} />;
}
