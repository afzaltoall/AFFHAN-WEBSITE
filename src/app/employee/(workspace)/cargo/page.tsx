import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isSalesJob, readWorkspaceAuth } from "@/lib/employee-session";
import { LIGHT_THEME } from "@/components/admin/console-theme";
import { CargoBoard } from "@/components/cargo/CargoBoard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cargo tracking — Affhan",
  robots: { index: false, follow: false },
};

/**
 * An assigner's workspace (Employee.job ASSIGNER, 2026-10-24): the cargo-tracking sheet, where they keep each
 * consignment and post the updates customers follow on /shipping/. A salesperson's workspace is their leads, so they
 * are sent there; an admin looking in sees the sheet as the assigners do.
 */
export default async function CargoPage() {
  const auth = await readWorkspaceAuth();
  // The layout has already turned away anyone without a session.
  if (!auth.ok) return null;
  if (auth.kind === "employee" && isSalesJob(auth.employee)) redirect("/employee/dashboard/");
  return <CargoBoard t={LIGHT_THEME} />;
}
