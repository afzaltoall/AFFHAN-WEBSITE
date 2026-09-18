import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EMPLOYEE_IDLE_MS, readWorkspaceAuth } from "@/lib/employee-session";
import { isLeadStatus, NOT_STARTED, type LeadOutcomeKey } from "@/lib/leadStatus";
import { EmployeeProfile, type ProfileActivity } from "@/components/employee/EmployeeProfile";
import { wt } from "@/components/employee/workspace-ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profile — Affhan staff",
  robots: { index: false, follow: false },
};

/**
 * The signed-in member of staff: who they are to the system, how their work is
 * going, and the two things they can change themselves — their photo and their
 * password.
 *
 * "How it is going" is computed from the same trail the admin reads: each
 * assigned lead counted once, by its newest outcome. The conversion rate is
 * converted over decided (converted plus not converted), not over everything
 * assigned — a lead still being worked has not failed, and counting it as if
 * it had would make a busy week look like a bad one.
 */
export default async function EmployeeProfilePage() {
  const auth = await readWorkspaceAuth();
  if (!auth.ok) return null;

  if (auth.kind !== "employee") {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Profile</h1>
        <p className={`mt-1 text-[13px] ${wt.soft}`}>
          You are signed in as an administrator, and administrators have no staff profile. Your account
          lives in the console.
        </p>
        <Link
          href="/admin/"
          className="mt-4 inline-flex items-center rounded-full bg-[#1d1d1f] px-4 py-2 text-[13px] font-semibold text-white"
        >
          Open the console
        </Link>
      </div>
    );
  }

  const id = auth.employee.id;
  const [row, inquiries, contacts, recorded, recent] = await Promise.all([
    prisma.employee.findUnique({
      where: { id },
      select: { name: true, email: true, region: true, role: true, image: true, createdAt: true, lastLoginAt: true },
    }),
    prisma.inquiry.findMany({ where: { assignedToId: id, status: { not: "deleted" } }, select: { id: true } }),
    prisma.contactMessage.findMany({ where: { assignedToId: id, status: { not: "deleted" } }, select: { id: true } }),
    prisma.statusUpdate.count({ where: { employeeId: id } }),
    prisma.statusUpdate.findMany({
      where: { employeeId: id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true, status: true, note: true, createdAt: true,
        inquiry: { select: { customerName: true, productName: true } },
        contact: { select: { fullName: true } },
      },
    }),
  ]);
  if (!row) return null;

  // Each assigned lead once, by its newest entry — whoever wrote it, since a
  // lead can arrive with history from somebody else.
  const trail = inquiries.length || contacts.length
    ? await prisma.statusUpdate.findMany({
        where: {
          OR: [
            { inquiryId: { in: inquiries.map((i) => i.id) } },
            { contactId: { in: contacts.map((c) => c.id) } },
          ],
        },
        orderBy: { createdAt: "desc" },
        select: { status: true, inquiryId: true, contactId: true },
      })
    : [];
  const breakdown: Record<LeadOutcomeKey, number> = {
    CONVERTED: 0, FOLLOW_UP: 0, IN_PROGRESS: 0, NOT_CONVERTED: 0, [NOT_STARTED]: 0,
  };
  const seen = new Set<string>();
  for (const u of trail) {
    const key = u.inquiryId ? `i:${u.inquiryId}` : `c:${u.contactId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isLeadStatus(u.status)) breakdown[u.status] += 1;
  }
  const assigned = inquiries.length + contacts.length;
  breakdown[NOT_STARTED] = Math.max(0, assigned - seen.size);

  const activity: ProfileActivity[] = recent.map((u) => ({
    id: u.id,
    status: u.status,
    note: u.note,
    createdAt: u.createdAt.toISOString(),
    who: u.inquiry?.customerName ?? u.contact?.fullName ?? "A lead",
    what: u.inquiry ? u.inquiry.productName : u.contact ? "Contact message" : "No longer on file",
  }));

  return (
    <EmployeeProfile
      profile={{
        name: row.name,
        email: row.email,
        region: row.region,
        rank: row.role === "ADMIN" ? "Admin" : "Employee",
        image: row.image,
        createdAt: row.createdAt.toISOString(),
        lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
      }}
      stats={{ assigned, inquiries: inquiries.length, contacts: contacts.length, recorded, breakdown }}
      activity={activity}
      idleMinutes={Math.round(EMPLOYEE_IDLE_MS / 60000)}
    />
  );
}
