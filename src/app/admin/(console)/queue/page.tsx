import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { customerCodesFor } from "@/lib/customerCode";
import { poolEvents } from "@/lib/lead-pool";
import { POOL_STATE, staleDeadline } from "@/lib/lead-pool-rules";
import { MAX_OPEN_LEADS } from "@/lib/lead-pool-config";
import { normalizeStatus } from "@/lib/leadStatus";
import { renderTime } from "@/lib/render-time";
import { QueueBoard, type QueueRow } from "@/components/admin/QueueBoard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Queue | Affhan Admin",
  robots: { index: false, follow: false },
};

/**
 * The open pool, from the office's side: who is waiting in it, who holds whom and how long before a silent one goes
 * back, and who the pool gave up on. Staff see the pool on their own board without names or numbers; this page is
 * the administrator's, with both, and the one place an administrator can put a held customer back in the pool.
 */
export default async function QueuePage() {
  const admin = await getCurrentUser();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "admin") redirect("/");

  const states = [POOL_STATE.OPEN, POOL_STATE.HELD, POOL_STATE.INVALID];
  const [entries, employees, history, setAside] = await Promise.all([
    prisma.leadQueueEntry.findMany({
      where: { state: { in: states } },
      orderBy: [{ updatedAt: "desc" }],
      take: 1500,
      select: {
        id: true, customerKey: true, customerName: true, state: true, handoffs: true,
        enteredAt: true, nextRotationAt: true, expiresAt: true, closedAt: true, updatedAt: true,
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
    poolEvents({ perPage: 60 }),
    // Customers kept out of the pool because the console has every request of theirs marked Handled, Spam or
    // deleted: a count, so the page says where the rest of the book is.
    prisma.leadQueueEntry.count({ where: { state: POOL_STATE.DONE } }),
  ]);

  // How much of each customer is at stake, and where the held ones stand: three grouped counts and one read of the
  // newest update per customer, rather than one query per row.
  const keys = entries.map((e) => e.customerKey);
  const live = { customerKey: { in: keys }, status: { not: "deleted" } };
  const [inquiryCounts, contactCounts, shipmentCounts, codes, latest] = keys.length
    ? await Promise.all([
        prisma.inquiry.groupBy({ by: ["customerKey"], where: live, _count: { _all: true } }),
        prisma.contactMessage.groupBy({ by: ["customerKey"], where: live, _count: { _all: true } }),
        prisma.shipmentInquiry.groupBy({ by: ["customerKey"], where: live, _count: { _all: true } }),
        customerCodesFor(keys),
        latestUpdatesFor(entries.filter((e) => e.state === POOL_STATE.HELD).map((e) => e.customerKey)),
      ])
    : [[], [], [], {} as Record<string, string>, new Map<string, { status: string; createdAt: Date }>()];
  const inquiriesBy = new Map(inquiryCounts.map((r) => [r.customerKey, r._count._all]));
  const contactsBy = new Map(contactCounts.map((r) => [r.customerKey, r._count._all]));
  const shipmentsBy = new Map(shipmentCounts.map((r) => [r.customerKey, r._count._all]));
  const heldBy = new Map<string, number>();
  for (const e of entries) if (e.state === POOL_STATE.HELD && e.currentEmployee) heldBy.set(e.currentEmployee.id, (heldBy.get(e.currentEmployee.id) ?? 0) + 1);

  const rows: QueueRow[] = entries.map((e) => {
    const last = latest.get(e.customerKey) ?? null;
    const inProgress = last && normalizeStatus(last.status) === "IN_PROGRESS";
    return {
      id: e.id,
      customerName: e.customerName,
      code: codes[e.customerKey] ?? null,
      state: e.state,
      holder: e.currentEmployee ? { id: e.currentEmployee.id, name: e.currentEmployee.name, image: e.currentEmployee.image } : null,
      takes: e.handoffs,
      enteredAt: e.enteredAt.toISOString(),
      expiresAt: e.expiresAt.toISOString(),
      releaseAt: e.state === POOL_STATE.HELD && e.nextRotationAt ? e.nextRotationAt.toISOString() : null,
      staleAt: e.state === POOL_STATE.HELD && !e.nextRotationAt && inProgress ? staleDeadline(last!.createdAt).toISOString() : null,
      lastUpdate: last ? { status: last.status, at: last.createdAt.toISOString() } : null,
      closedAt: e.closedAt ? e.closedAt.toISOString() : null,
      since: e.updatedAt.toISOString(),
      inquiries: inquiriesBy.get(e.customerKey) ?? 0,
      contacts: contactsBy.get(e.customerKey) ?? 0,
      shipments: shipmentsBy.get(e.customerKey) ?? 0,
      trail: e.events.map((v) => ({ id: v.id, kind: v.kind, from: v.fromName, to: v.toName, note: v.note, at: v.createdAt.toISOString() })),
    };
  });

  return (
    <QueueBoard
      rows={rows}
      history={history.rows}
      employees={employees.map((p) => ({ ...p, held: heldBy.get(p.id) ?? 0 }))}
      cap={MAX_OPEN_LEADS}
      setAside={setAside}
      renderedAt={renderTime()}
    />
  );
}

/** The newest status update on each customer's live leads, for the held ones. */
async function latestUpdatesFor(keys: string[]) {
  const out = new Map<string, { status: string; createdAt: Date }>();
  if (keys.length === 0) return out;
  const rows = await prisma.$queryRaw<{ k: string; status: string; createdAt: Date }[]>`
    SELECT DISTINCT ON (k) k, status, "createdAt" FROM (
      SELECT i."customerKey" AS k, u.status, u."createdAt" FROM "StatusUpdate" u JOIN "Inquiry" i ON i.id = u."inquiryId" WHERE i."customerKey" = ANY(${keys})
      UNION ALL
      SELECT m."customerKey", u.status, u."createdAt" FROM "StatusUpdate" u JOIN "ContactMessage" m ON m.id = u."contactId" WHERE m."customerKey" = ANY(${keys})
      UNION ALL
      SELECT s."customerKey", u.status, u."createdAt" FROM "StatusUpdate" u JOIN "ShipmentInquiry" s ON s.id = u."shipmentId" WHERE s."customerKey" = ANY(${keys})
    ) x ORDER BY k, "createdAt" DESC`;
  for (const r of rows) out.set(r.k, { status: r.status, createdAt: r.createdAt });
  return out;
}
