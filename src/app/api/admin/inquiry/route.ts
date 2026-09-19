import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { manualAssignCustomers } from "@/lib/lead-queue";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

// Bulk inquiry actions (also used for single-row actions — the client always
// sends an array). Soft-delete/restore/status are status flips (nothing lost);
// "purge" is the only operation that actually removes rows.
//   { ids: string[], action: "delete" | "restore" | "purge" | "status", status?: "new"|"handled"|"spam" }
//   { ids: string[], action: "assign", assignedToId: string | null }
// "assign" hands the inquiry to a member of staff (or takes it back with
// null); it is the only action here that does not touch `status`.
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

  try {
    if (action === "assign") {
      // null clears the assignment; a string must name an employee who can
      // actually work it, so a lead cannot be parked on a deactivated account.
      const assignedToId: unknown = body?.assignedToId;
      if (assignedToId !== null && typeof assignedToId !== "string") {
        return NextResponse.json({ error: "assignedToId must be a string or null" }, { status: 400 });
      }
      if (typeof assignedToId === "string") {
        const employee = await prisma.employee.findUnique({
          where: { id: assignedToId },
          select: { isActive: true },
        });
        if (!employee) return NextResponse.json({ error: "No such employee" }, { status: 400 });
        if (!employee.isActive) {
          return NextResponse.json({ error: "That employee is deactivated" }, { status: 400 });
        }
      }
      const { count } = await prisma.inquiry.updateMany({
        where: { id: { in: ids as string[] } },
        data: {
          assignedToId: assignedToId as string | null,
          // Stamped on every handover, cleared when nobody holds it: the
          // question assignedAt answers is "how long has it been sitting with
          // the person who has it now", which has no answer once it is back in
          // nobody's hands.
          assignedAt: assignedToId ? new Date() : null,
        },
      });
      // Assigning a customer who is going round the rotation queue is a
      // decision about who works them, and the queue must not undo it two
      // hours later. See lib/lead-queue.ts.
      const released = await manualAssignCustomers({
        leads: (ids as string[]).map((id) => ({ kind: "inquiry" as const, id })),
        employeeId: assignedToId as string | null,
      });
      return NextResponse.json({ ok: true, action, assignedToId, count, released });
    }

    if (action === "purge") {
      const { count } = await prisma.inquiry.deleteMany({ where: { id: { in: ids as string[] } } });
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
    const { count } = await prisma.inquiry.updateMany({
      where: { id: { in: ids as string[] } },
      data: { status },
    });
    return NextResponse.json({ ok: true, action, status, count });
  } catch {
    return NextResponse.json({ error: "Bulk action failed" }, { status: 500 });
  }
}
