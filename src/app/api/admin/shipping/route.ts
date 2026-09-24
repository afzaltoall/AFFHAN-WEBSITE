import { NextResponse } from "next/server";
import { prisma, withDbRetry } from "@/lib/prisma";
import { manualAssignCustomers } from "@/lib/lead-queue";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

/**
 * The newest this many rows. Freight requests arrive a few a day at most, so
 * this is years of them; `total` goes back with the rows, and the console says
 * so if it is ever the smaller number, rather than letting a cap pass for the
 * whole table.
 */
const TAKE = 2000;

/**
 * Freight quote requests, for the console's Shipping view.
 *
 * Read here rather than by the console page, which already runs ten
 * statements against a pool of ten (see the note in (console)/page.tsx):
 * adding an eleventh there would make every load of /admin pay for a view most
 * loads never open. The view asks for its own rows when it is opened.
 *
 * Three statements: the rows, how many there are, and the newest sales
 * outcome on each — the same DISTINCT ON the console runs for the other two
 * lead tables.
 */
export async function GET() {
  if (!(await requireAdmin())) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const [rows, total, outcomes] = await withDbRetry(() =>
      Promise.all([
        prisma.shipmentInquiry.findMany({ orderBy: { createdAt: "desc" }, take: TAKE }),
        prisma.shipmentInquiry.count(),
        prisma.$queryRaw<{ leadId: string; status: string; note: string | null; createdAt: Date; byName: string }[]>`
          SELECT DISTINCT ON (su."shipmentId")
                 su."shipmentId" AS "leadId", su.status, su.note, su."createdAt", e.name AS "byName"
            FROM "StatusUpdate" su
            JOIN "Employee" e ON e.id = su."employeeId"
           WHERE su."shipmentId" IS NOT NULL
           ORDER BY su."shipmentId", su."createdAt" DESC
        `,
      ])
    );

    const outcomeOf = new Map(
      outcomes.map((o) => [o.leadId, { status: o.status, by: o.byName, note: o.note, at: o.createdAt.toISOString() }])
    );

    const shipments = rows.map((s) => ({
      id: s.id,
      referenceNo: s.referenceNo,
      createdAt: s.createdAt.toISOString(),
      customerName: s.customerName,
      phone: s.phone,
      email: s.email,
      country: s.country,
      commodity: s.commodity,
      commodityType: s.commodityType,
      mode: s.mode,
      method: s.method,
      portOfLoading: s.portOfLoading,
      portOfDischarge: s.portOfDischarge,
      terms: s.terms,
      // Decimals as their exact text: a Number would print 12.5 as 12.5 but
      // could print a three-place CBM with binary noise on the end.
      cbm: s.cbm.toString(),
      weightKg: s.weightKg.toString(),
      cartonBoxes: s.cartonBoxes,
      notes: s.notes,
      source: s.source,
      status: s.status,
      assignedToId: s.assignedToId,
      customerKey: s.customerKey,
      lastStatus: outcomeOf.get(s.id) ?? null,
    }));

    return NextResponse.json({ shipments, total, cap: TAKE });
  } catch (error) {
    console.error("shipping list failed:", error instanceof Error ? `${error.name}: ${error.message.split("\n")[0]}` : "unknown");
    return NextResponse.json({ error: "Could not load freight requests." }, { status: 500 });
  }
}

// Bulk actions, and single-row ones as a list of one — the same shape as
// /api/admin/contact:
//   { ids: string[], action: "delete" | "restore" | "purge" | "status", status?: "new"|"handled"|"spam" }
//   { ids: string[], action: "assign", assignedToId: string | null }
// delete/restore/status flip `status` and lose nothing; purge removes the rows,
// and with them their sales trail (StatusUpdate cascades).
const TRIAGE = ["new", "handled", "spam"] as const;

export async function POST(req: Request) {
  if (!(await requireAdmin())) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: unknown = body?.ids;
  const action: unknown = body?.action;

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === "string")) {
    return NextResponse.json({ error: "ids must be a non-empty string array" }, { status: 400 });
  }
  if (action !== "delete" && action !== "restore" && action !== "purge" && action !== "status" && action !== "assign") {
    return NextResponse.json({ error: "action must be delete | restore | purge | status | assign" }, { status: 400 });
  }
  const idList = ids as string[];

  try {
    if (action === "assign") {
      // null takes it off everybody; a string must be somebody who can sign in
      // and work it, never a deactivated account.
      const assignedToId: unknown = body?.assignedToId;
      if (assignedToId !== null && typeof assignedToId !== "string") {
        return NextResponse.json({ error: "assignedToId must be a string or null" }, { status: 400 });
      }
      if (typeof assignedToId === "string") {
        const employee = await prisma.employee.findUnique({ where: { id: assignedToId }, select: { isActive: true } });
        if (!employee) return NextResponse.json({ error: "No such employee" }, { status: 400 });
        if (!employee.isActive) return NextResponse.json({ error: "That employee is deactivated" }, { status: 400 });
      }
      const { count } = await prisma.shipmentInquiry.updateMany({
        where: { id: { in: idList } },
        data: { assignedToId: assignedToId as string | null, assignedAt: assignedToId ? new Date() : null },
      });
      // Taking a queued customer over by hand ends their rotation, as it does
      // from the other two lists.
      const released = await manualAssignCustomers({
        leads: idList.map((id) => ({ kind: "shipment" as const, id })),
        employeeId: assignedToId as string | null,
      });
      return NextResponse.json({ ok: true, action, assignedToId, count, released });
    }

    if (action === "purge") {
      // Only from Recently Deleted: a live request cannot be erased in one
      // step, whatever the client sends.
      const { count } = await prisma.shipmentInquiry.deleteMany({ where: { id: { in: idList }, status: "deleted" } });
      return NextResponse.json({ ok: true, action, count });
    }

    let status: string;
    if (action === "status") {
      if (!(TRIAGE as readonly string[]).includes(body?.status)) {
        return NextResponse.json({ error: "status must be new | handled | spam" }, { status: 400 });
      }
      status = body.status;
    } else {
      status = action === "delete" ? "deleted" : "new"; // restore -> new
    }
    const { count } = await prisma.shipmentInquiry.updateMany({ where: { id: { in: idList } }, data: { status } });
    return NextResponse.json({ ok: true, action, status, count });
  } catch (error) {
    console.error("shipping action failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Bulk action failed" }, { status: 500 });
  }
}
