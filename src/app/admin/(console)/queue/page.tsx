import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { QUEUE_STATE } from "@/lib/lead-queue";
import { QueueBoard, type QueueRow } from "@/components/admin/QueueBoard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Queue | Affhan Admin",
  robots: { index: false, follow: false },
};

/**
 * The rotation queue, from the office's side.
 *
 * Customers nobody has taken on, going round the team — and the two states
 * that need somebody to look at them rather than wait: the ones parked because
 * there was nobody to hand them to, and the ones the rotation gave up on after
 * offering them round twice.
 *
 * The salespeople see none of this. To them a rotated customer is an ordinary
 * lead that arrived; the queue exists so that a customer cannot quietly sit
 * with somebody who is not working them, and this page is where that becomes
 * visible.
 */
export default async function QueuePage() {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");

  const [entries, employees] = await Promise.all([
    prisma.leadQueueEntry.findMany({
      where: { state: { in: [QUEUE_STATE.ROTATING, QUEUE_STATE.INVALID] } },
      orderBy: [{ state: "asc" }, { nextRotationAt: "asc" }, { enteredAt: "asc" }],
      take: 200,
      select: {
        id: true, customerKey: true, customerName: true, state: true,
        currentEmployeeId: true, handoffs: true, passes: true,
        enteredAt: true, nextRotationAt: true, expiresAt: true, closedAt: true,
        currentEmployee: { select: { id: true, name: true, image: true } },
        events: {
          orderBy: { createdAt: "desc" },
          take: 6,
          select: { id: true, kind: true, fromName: true, toName: true, note: true, createdAt: true },
        },
      },
    }),
    prisma.employee.findMany({
      where: { isActive: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, name: true, region: true, image: true },
    }),
  ]);

  // How much of each customer is actually at stake: counted per customer key
  // in two grouped queries rather than one per row.
  const keys = entries.map((e) => e.customerKey);
  const [inquiryCounts, contactCounts] = keys.length
    ? await Promise.all([
        prisma.inquiry.groupBy({
          by: ["customerKey"],
          where: { customerKey: { in: keys }, status: { not: "deleted" } },
          _count: { _all: true },
        }),
        prisma.contactMessage.groupBy({
          by: ["customerKey"],
          where: { customerKey: { in: keys }, status: { not: "deleted" } },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  const inquiriesBy = new Map(inquiryCounts.map((r) => [r.customerKey, r._count._all]));
  const contactsBy = new Map(contactCounts.map((r) => [r.customerKey, r._count._all]));

  const rows: QueueRow[] = entries.map((e) => ({
    id: e.id,
    customerKey: e.customerKey,
    customerName: e.customerName,
    state: e.state,
    holder: e.currentEmployee ? { id: e.currentEmployee.id, name: e.currentEmployee.name, image: e.currentEmployee.image } : null,
    handoffs: e.handoffs,
    passes: e.passes,
    enteredAt: e.enteredAt.toISOString(),
    nextRotationAt: e.nextRotationAt ? e.nextRotationAt.toISOString() : null,
    expiresAt: e.expiresAt.toISOString(),
    closedAt: e.closedAt ? e.closedAt.toISOString() : null,
    inquiries: inquiriesBy.get(e.customerKey) ?? 0,
    contacts: contactsBy.get(e.customerKey) ?? 0,
    trail: e.events.map((v) => ({
      id: v.id,
      kind: v.kind,
      from: v.fromName,
      to: v.toName,
      note: v.note,
      at: v.createdAt.toISOString(),
    })),
  }));

  return <QueueBoard rows={rows} employees={employees} />;
}
