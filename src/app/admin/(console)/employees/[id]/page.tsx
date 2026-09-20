import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { leadPerformance, winRateOf } from "@/lib/lead-performance";
import { EmployeeDetail } from "@/components/admin/EmployeeDetail";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staff member | Affhan Admin",
  robots: { index: false, follow: false },
};

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");

  const { id } = await params;
  const employee = await prisma.employee.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      role: true,
      region: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      _count: { select: { assignedInquiries: true, assignedContacts: true, statusUpdates: true } },
    },
  });
  if (!employee) notFound();

  // Their book by newest outcome, from the same two statements the team page
  // uses — one person rather than everybody, not a different calculation.
  const [performance] = await leadPerformance({ employeeId: id });

  const updates = await prisma.statusUpdate.findMany({
    where: { employeeId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      status: true,
      note: true,
      createdAt: true,
      // phone is the customer key (lib/customerGroups.ts): it is what puts the
      // rows of one customer-level outcome back into one line below.
      inquiry: { select: { id: true, customerName: true, productName: true, email: true, phone: true } },
      contact: { select: { id: true, fullName: true, email: true, phone: true } },
    },
  });

  return (
    <EmployeeDetail
      employee={{
        id: employee.id,
        email: employee.email,
        name: employee.name,
        image: employee.image,
        role: employee.role,
        region: employee.region,
        isActive: employee.isActive,
        lastLoginAt: employee.lastLoginAt ? employee.lastLoginAt.toISOString() : null,
        createdAt: employee.createdAt.toISOString(),
      }}
      counts={{
        inquiries: employee._count.assignedInquiries,
        contacts: employee._count.assignedContacts,
        updates: employee._count.statusUpdates,
      }}
      performance={
        performance
          ? {
              assigned: performance.assigned,
              inquiries: performance.inquiries,
              contacts: performance.contacts,
              counts: performance.counts,
              recorded: performance.recorded,
              thisWeek: performance.thisWeek,
              lastWeek: performance.lastWeek,
              winRate: winRateOf(performance.counts.LEAD, performance.counts.NO_LEAD),
            }
          : null
      }
      updates={updates.map((u) => ({
        id: u.id,
        status: u.status,
        note: u.note,
        createdAt: u.createdAt.toISOString(),
        inquiry: u.inquiry,
        contact: u.contact,
      }))}
    />
  );
}
