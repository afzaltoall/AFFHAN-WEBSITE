import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { assignedOutcomes, leadPerformance, teamTotals, winRateOf } from "@/lib/lead-performance";
import { TeamPerformance, type TeamRow } from "@/components/admin/TeamPerformance";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Team performance | Affhan Admin",
  robots: { index: false, follow: false },
};

/**
 * How the sales team is doing, everybody on one screen.
 *
 * The question this page exists for is the one nobody could answer without
 * opening five pages in turn: who is carrying how much, and what is coming of
 * it. Read-only on purpose — assigning and reassigning happen where the leads
 * are, and a screen that both measures people and moves their work invites
 * doing the second while looking at the first.
 *
 * Three statements for the whole team, however many people there are: see
 * lib/lead-performance.ts. The table's rows are what each person has done
 * with their own book; the strip above it counts leads rather than people,
 * so a deal that changes hands is not lost from the headline.
 */
export default async function TeamPerformancePage() {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");

  const [people, outcomes] = await Promise.all([leadPerformance(), assignedOutcomes()]);
  const totals = teamTotals(people, outcomes);

  const rows: TeamRow[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    image: p.image,
    region: p.region,
    assigned: p.assigned,
    counts: p.counts,
    recorded: p.recorded,
    thisWeek: p.thisWeek,
    winRate: winRateOf(p.counts.LEAD, p.counts.NO_LEAD),
  }));

  return <TeamPerformance rows={rows} totals={totals} />;
}
