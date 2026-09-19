import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EMPLOYEE_IDLE_MS, readWorkspaceAuth } from "@/lib/employee-session";
import { isStoredLeadStatus, NOT_STARTED, OUTCOME_ORDER, type LeadOutcomeKey } from "@/lib/leadStatus";
import { normalizePhoneKey } from "@/lib/customerGroups";
import { collapseUpdates } from "@/lib/statusBatch";
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
    // Forty rows to fill eight lines: one outcome recorded against a customer
    // writes a row per product they asked about (see the status route), and
    // the list below shows the action, not the rows.
    prisma.statusUpdate.findMany({
      where: { employeeId: id },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true, status: true, note: true, createdAt: true,
        inquiry: { select: { customerName: true, productName: true, phone: true } },
        contact: { select: { fullName: true, phone: true } },
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
        select: { status: true, inquiryId: true, contactId: true, employeeId: true },
      })
    : [];
  // Every outcome at zero to begin with, from the one list of them — the keys
  // were written out here once and went stale the moment the vocabulary
  // changed.
  const breakdown = Object.fromEntries(OUTCOME_ORDER.map((k) => [k, 0])) as Record<LeadOutcomeKey, number>;
  const seen = new Set<string>();
  for (const u of trail) {
    // Somebody else's "Not attended" is hidden from staff — the dashboard says
    // why — so it must not decide where a lead of theirs stands either.
    if (u.status === "NOT_ATTENDED" && u.employeeId !== id) continue;
    const key = u.inquiryId ? `i:${u.inquiryId}` : `c:${u.contactId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isStoredLeadStatus(u.status)) breakdown[u.status] += 1;
  }
  const assigned = inquiries.length + contacts.length;
  breakdown[NOT_STARTED] = Math.max(0, assigned - seen.size);

  const activity: ProfileActivity[] = collapseUpdates(recent, (u) => ({
    status: u.status,
    note: u.note,
    createdAt: u.createdAt,
    scope:
      normalizePhoneKey(u.inquiry?.phone ?? u.contact?.phone ?? "") ||
      u.inquiry?.customerName ||
      u.contact?.fullName ||
      "",
  }))
    .slice(0, 8)
    .map((batch) => {
      const u = batch[0];
      const items = batch.map((b) => (b.inquiry ? b.inquiry.productName : b.contact ? "Contact message" : null)).filter(Boolean);
      return {
        id: u.id,
        status: u.status,
        note: u.note,
        createdAt: u.createdAt.toISOString(),
        who: u.inquiry?.customerName ?? u.contact?.fullName ?? "A lead",
        what:
          items.length === 0
            ? "No longer on file"
            : items.length === 1
              ? (items[0] as string)
              : `${items.length} products · ${items.join(", ")}`,
      };
    });

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
