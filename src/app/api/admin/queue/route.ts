import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { assignQueuedCustomer, requeueCustomer } from "@/lib/lead-queue";

export const dynamic = "force-dynamic";

/**
 * What an administrator can do to a customer in the rotation queue.
 *
 *   { entryId, action: "assign", employeeId }   give them to somebody, and
 *                                               take them out of the rotation
 *   { entryId, action: "requeue" }              put a given-up-on customer
 *                                               back into it
 *
 * Both are deliberate acts on one customer, which is why neither is a bulk
 * operation: the console's own assign handles lists of leads, and this handles
 * the queue, where the unit is a person and the decision is about who should
 * be calling them.
 *
 * Assigning ends the rotation (state MANUAL). It has to: the sweep would
 * otherwise take the customer off whoever the administrator just chose, two
 * working hours later, for the crime of not having answered yet.
 */
export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const entryId = typeof body?.entryId === "string" ? body.entryId : "";
  const action = body?.action;
  if (!entryId) return NextResponse.json({ error: "entryId is required" }, { status: 400 });
  if (action !== "assign" && action !== "requeue") {
    return NextResponse.json({ error: "action must be assign or requeue" }, { status: 400 });
  }

  const entry = await prisma.leadQueueEntry.findUnique({ where: { id: entryId }, select: { id: true, customerKey: true } });
  if (!entry) return NextResponse.json({ error: "No such queue entry" }, { status: 404 });

  try {
    if (action === "assign") {
      const employeeId: unknown = body?.employeeId;
      if (employeeId !== null && typeof employeeId !== "string") {
        return NextResponse.json({ error: "employeeId must be a string or null" }, { status: 400 });
      }
      if (typeof employeeId === "string") {
        // The console refuses to park a lead on a deactivated account, and so
        // does this: a customer handed to somebody who cannot sign in is a
        // customer nobody is working.
        const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { isActive: true } });
        if (!employee) return NextResponse.json({ error: "No such employee" }, { status: 400 });
        if (!employee.isActive) return NextResponse.json({ error: "That employee is deactivated" }, { status: 400 });
      }
      const result = await assignQueuedCustomer({ entryId, employeeId: employeeId as string | null });
      return NextResponse.json({ ok: true, ...result });
    }

    const result = await requeueCustomer({ entryId });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    console.error("queue action failed:", error instanceof Error ? error.name : "unknown", code ?? "");
    return NextResponse.json({ error: "Could not do that. Try again." }, { status: 500 });
  }
}
