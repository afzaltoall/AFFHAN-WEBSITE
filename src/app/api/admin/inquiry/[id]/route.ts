import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { describeStatus, isMobileInquiryStatus } from "@/lib/inquiry-status";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

const ALLOWED_STATUS = ["new", "handled", "spam"] as const;
const NOTE_MAX = 500;

/**
 * Update one inquiry. Two independent things live behind this verb.
 *
 * `status` is internal triage — new | handled | spam — and is unchanged: the
 * admin console's filter chips and bulk actions are built on it.
 *
 * `customerStatus` is the lifecycle the customer is shown on their account
 * page. Moving it stamps statusUpdatedAt and appends to the trail, so "why does
 * this say In Progress, and who said so" stays answerable later.
 *
 * A request carrying customerStatus takes that path; anything else falls
 * through to triage, so every existing caller behaves exactly as before.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // ---- Customer-facing lifecycle -----------------------------------------
  if (body?.customerStatus !== undefined) {
    if (!isMobileInquiryStatus(body.customerStatus)) {
      return NextResponse.json(
        { error: "customerStatus must be PENDING, CHECKED, IN_PROGRESS or CUSTOM." },
        { status: 400 }
      );
    }

    const note = typeof body?.statusNote === "string" ? body.statusNote.trim() : "";
    if (note.length > NOTE_MAX) {
      return NextResponse.json(
        { error: `Note must be ${NOTE_MAX} characters or fewer.` },
        { status: 400 }
      );
    }
    // CUSTOM exists to say something the fixed three cannot. Without the text
    // the customer is left staring at a badge that tells them nothing.
    if (body.customerStatus === "CUSTOM" && !note) {
      return NextResponse.json(
        { error: "A custom status needs the text to show the customer." },
        { status: 400 }
      );
    }

    const before = await prisma.inquiry.findUnique({
      where: { id },
      select: { customerStatus: true },
    });
    if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.inquiry.update({
      where: { id },
      data: {
        customerStatus: body.customerStatus,
        statusNote: note || null,
        statusUpdatedAt: new Date(),
        statusEvents: {
          create: {
            fromStatus: before.customerStatus,
            toStatus: body.customerStatus,
            note: note || null,
            changedById: admin.id,
            // Copied, not just referenced: the trail has to stay readable
            // after staff turnover, when the id resolves to nobody.
            changedByName: admin.name || admin.email,
          },
        },
      },
      select: { id: true, customerStatus: true, statusNote: true, statusUpdatedAt: true },
    });

    return NextResponse.json({
      id: updated.id,
      customerStatus: updated.customerStatus,
      statusNote: updated.statusNote,
      statusUpdatedAt: updated.statusUpdatedAt,
      ...describeStatus(updated.customerStatus, updated.statusNote),
    });
  }

  // ---- Internal triage (unchanged) ---------------------------------------
  const status = (ALLOWED_STATUS as readonly string[]).includes(body?.status) ? body.status : "new";
  try {
    const updated = await prisma.inquiry.update({ where: { id }, data: { status } });
    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

// Permanently remove an inquiry.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  try {
    await prisma.inquiry.delete({ where: { id } });
    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
