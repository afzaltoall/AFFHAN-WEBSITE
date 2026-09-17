import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readEmployeeAuth } from "@/lib/employee-session";
import { isLeadStatus, LEAD_NOTE_MAX } from "@/lib/leadStatus";

export const dynamic = "force-dynamic";

/**
 * Record what happened to a lead.
 *
 * Append-only: every submission is a new StatusUpdate row, never an edit of the
 * last one. "Latest status" is the newest row, and the earlier ones are the
 * point of the table — see the model's comment in schema.prisma.
 *
 * An employee may only write against a lead that is assigned to them. The check
 * is a condition on the lookup, not a filter afterwards, so a guessed id fails
 * the same way a stranger's lead does: 404, telling the caller nothing about
 * whether the row exists.
 *
 * Admins are refused outright rather than allowed through as a courtesy:
 * StatusUpdate.employeeId is a foreign key onto Employee, and an admin session
 * has no Employee row behind it. The trail says who did the work; an admin
 * writing into it would have to borrow somebody's name to do so.
 */
export async function POST(request: Request) {
  const auth = await readEmployeeAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Not signed in", reason: auth.reason }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const kind = body?.kind;
    const leadId = typeof body?.leadId === "string" ? body.leadId : "";
    const status = body?.status;
    const rawNote = typeof body?.note === "string" ? body.note.trim() : "";

    if (kind !== "inquiry" && kind !== "contact") {
      return NextResponse.json({ error: "kind must be inquiry or contact" }, { status: 400 });
    }
    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }
    if (!isLeadStatus(status)) {
      return NextResponse.json({ error: "Choose one of the four outcomes." }, { status: 400 });
    }
    if (rawNote.length > LEAD_NOTE_MAX) {
      return NextResponse.json({ error: `Keep the note under ${LEAD_NOTE_MAX} characters.` }, { status: 400 });
    }

    // Assigned to this employee, and not in the console's Recently Deleted.
    const owns =
      kind === "inquiry"
        ? await prisma.inquiry.findFirst({
            where: { id: leadId, assignedToId: auth.employee.id, status: { not: "deleted" } },
            select: { id: true },
          })
        : await prisma.contactMessage.findFirst({
            where: { id: leadId, assignedToId: auth.employee.id, status: { not: "deleted" } },
            select: { id: true },
          });

    if (!owns) {
      return NextResponse.json({ error: "That lead is not assigned to you." }, { status: 404 });
    }

    const update = await prisma.statusUpdate.create({
      data: {
        employeeId: auth.employee.id,
        ...(kind === "inquiry" ? { inquiryId: leadId } : { contactId: leadId }),
        status,
        note: rawNote || null,
      },
      select: { id: true, status: true, note: true, createdAt: true },
    });

    return NextResponse.json({
      update: { ...update, createdAt: update.createdAt.toISOString() },
    });
  } catch (error) {
    console.error("employee status update error", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Could not record that. Try again." }, { status: 500 });
  }
}
