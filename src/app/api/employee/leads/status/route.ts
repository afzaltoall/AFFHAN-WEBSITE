import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readEmployeeAuth } from "@/lib/employee-session";
import { isLeadStatus, LEAD_NOTE_MAX } from "@/lib/leadStatus";
import { declineCustomer, touchCustomer } from "@/lib/lead-queue";

export const dynamic = "force-dynamic";

/**
 * One outcome covers a customer's whole basket, so the cap has to clear the
 * largest basket anybody really has — the workspace itself only ever loads 200
 * leads per person. Beyond this it is not a customer, it is a bug or a flood.
 */
const MAX_LEADS = 100;

interface LeadRef {
  kind: "inquiry" | "contact";
  id: string;
}

/**
 * Record what happened to a lead — or, when the caller sends several, to a
 * customer.
 *
 * Append-only: every submission is a new StatusUpdate row, never an edit of the
 * last one. "Latest status" is the newest row, and the earlier ones are the
 * point of the table — see the model's comment in schema.prisma.
 *
 * A customer is several inquiries, one per product they asked about, and an
 * outcome is about the customer: "called Ravi, he ordered" is one thing that
 * happened, not four. So the workspace posts every lead of theirs at once and
 * this writes one row against each, sharing a timestamp, status and note.
 * Storing it per lead rather than adding a customer column keeps every
 * existing read working — each lead still carries its own trail, the console
 * still shows a per-row outcome, and there is no migration — and lib/
 * statusBatch.ts puts the rows back together wherever they are listed as
 * events. The single-lead body (kind + leadId) still works and means the same
 * thing as a list of one.
 *
 * An employee may only write against leads that are assigned to them. The
 * check is a condition on the lookup, not a filter afterwards, so a guessed id
 * fails the same way a stranger's lead does: 404, telling the caller nothing
 * about whether the row exists. A batch is refused entirely if any one of its
 * leads is not theirs, rather than quietly recording the rest — a partial
 * write would leave the customer's products disagreeing about what happened.
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
    const status = body?.status;
    const rawNote = typeof body?.note === "string" ? body.note.trim() : "";

    // Either shape: a list of leads, or the original single lead.
    const single = !Array.isArray(body?.leads);
    const raw: unknown[] = single ? [{ kind: body?.kind, id: body?.leadId }] : body.leads;

    if (raw.length === 0) {
      return NextResponse.json({ error: "No leads given." }, { status: 400 });
    }
    if (raw.length > MAX_LEADS) {
      return NextResponse.json({ error: `That is more than ${MAX_LEADS} leads at once.` }, { status: 400 });
    }

    const refs: LeadRef[] = [];
    const seen = new Set<string>();
    for (const entry of raw) {
      const kind = (entry as LeadRef)?.kind;
      const id = (entry as LeadRef)?.id;
      if (kind !== "inquiry" && kind !== "contact") {
        return NextResponse.json({ error: "kind must be inquiry or contact" }, { status: 400 });
      }
      if (typeof id !== "string" || !id) {
        return NextResponse.json({ error: single ? "leadId is required" : "Every lead needs an id." }, { status: 400 });
      }
      const key = `${kind}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ kind, id });
    }

    if (!isLeadStatus(status)) {
      return NextResponse.json({ error: "Choose one of the four outcomes." }, { status: 400 });
    }
    if (rawNote.length > LEAD_NOTE_MAX) {
      return NextResponse.json({ error: `Keep the note under ${LEAD_NOTE_MAX} characters.` }, { status: 400 });
    }

    // Assigned to this employee, and not in the console's Recently Deleted.
    const inquiryIds = refs.filter((r) => r.kind === "inquiry").map((r) => r.id);
    const contactIds = refs.filter((r) => r.kind === "contact").map((r) => r.id);
    const [ownedInquiries, ownedContacts] = await Promise.all([
      inquiryIds.length
        ? prisma.inquiry.findMany({
            where: { id: { in: inquiryIds }, assignedToId: auth.employee.id, status: { not: "deleted" } },
            select: { id: true },
          })
        : Promise.resolve([]),
      contactIds.length
        ? prisma.contactMessage.findMany({
            where: { id: { in: contactIds }, assignedToId: auth.employee.id, status: { not: "deleted" } },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);

    if (ownedInquiries.length !== inquiryIds.length || ownedContacts.length !== contactIds.length) {
      return NextResponse.json(
        {
          error:
            refs.length === 1
              ? "That lead is not assigned to you."
              : "Some of those leads are not assigned to you any more. Refresh and try again.",
        },
        { status: 404 }
      );
    }

    // One timestamp for the whole action, set here rather than left to each
    // row's default, so the rows are provably one thing and not five that
    // happened to land in the same millisecond.
    const createdAt = new Date();
    const updates = await prisma.$transaction(
      refs.map((ref) =>
        prisma.statusUpdate.create({
          data: {
            employeeId: auth.employee.id,
            ...(ref.kind === "inquiry" ? { inquiryId: ref.id } : { contactId: ref.id }),
            status,
            note: rawNote || null,
            createdAt,
          },
          select: { id: true, status: true, note: true, createdAt: true, inquiryId: true, contactId: true },
        })
      )
    );

    const shaped = updates.map((u) => ({
      id: u.id,
      status: u.status,
      note: u.note,
      createdAt: u.createdAt.toISOString(),
      kind: u.inquiryId ? ("inquiry" as const) : ("contact" as const),
      leadId: u.inquiryId ?? u.contactId ?? "",
    }));

    // What the record MEANS for who holds this customer, after the record
    // itself is safely written. See lib/lead-queue.ts.
    //
    //   Not attended  they cannot take it on, so it goes to the next person
    //                 immediately — not in two hours' time.
    //   Lead/No lead  somebody has decided; the queue lets go.
    //   In progress   they are on it, which stops the silence timer.
    //
    // Deliberately after the response's data is assembled and inside its own
    // try: a customer who cannot be moved must not cost the salesperson the
    // outcome they just recorded.
    try {
      if (status === "NOT_ATTENDED") {
        await declineCustomer({ leads: refs, employeeId: auth.employee.id, employeeName: auth.employee.name, now: createdAt });
      } else {
        await touchCustomer({ leads: refs, employeeId: auth.employee.id, employeeName: auth.employee.name, status, now: createdAt });
      }
    } catch (error) {
      // The name alone was not enough to act on the first time this failed:
      // Prisma's code says which constraint or which stage, and the first line
      // of the message says where. Neither carries customer data.
      const code = (error as { code?: string } | null)?.code;
      console.error(
        "lead queue follow-up failed:",
        error instanceof Error ? error.name : "unknown",
        code ?? "",
        error instanceof Error ? error.message.split("\n")[0] : ""
      );
    }

    // `update` is the single-lead answer this route has always given; `updates`
    // is the whole action. Both are sent so neither caller has to branch.
    return NextResponse.json({ updates: shaped, update: shaped[0] });
  } catch (error) {
    console.error("employee status update error", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Could not record that. Try again." }, { status: 500 });
  }
}
