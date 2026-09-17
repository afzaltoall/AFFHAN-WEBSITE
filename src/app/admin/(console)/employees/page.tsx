import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { EmployeeManagement } from "@/components/admin/EmployeeManagement";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staff | Affhan Admin",
  robots: { index: false, follow: false },
};

export default async function EmployeesPage() {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");

  // Rendered server-side so the table is populated on first paint; the client
  // re-reads /api/admin/employees after anything it changes.
  const employees = await prisma.employee.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
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

  return (
    <EmployeeManagement
      initial={employees.map((e) => ({
        id: e.id,
        email: e.email,
        name: e.name,
        image: e.image,
        role: e.role,
        region: e.region,
        isActive: e.isActive,
        lastLoginAt: e.lastLoginAt ? e.lastLoginAt.toISOString() : null,
        createdAt: e.createdAt.toISOString(),
        assignedLeads: e._count.assignedInquiries + e._count.assignedContacts,
        statusUpdates: e._count.statusUpdates,
      }))}
    />
  );
}
