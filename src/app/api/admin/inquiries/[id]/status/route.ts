import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { describeStatus, isMobileInquiryStatus } from "@/lib/inquiry-status";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

const NOTE_MAX = 500;

// Move an inquiry along. The customer sees the result on their next open of the
// app, so the note is customer-facing copy, not an internal remark.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    if (!isMobileInquiryStatus(body?.status)) {
      return NextResponse.json(
        { error: "status must be PENDING, CHECKED, IN_PROGRESS or CUSTOM." },
        { status: 400 }
      );
    }

    const rawNote = typeof body?.statusNote === "string" ? body.statusNote.trim() : "";
    if (rawNote.length > NOTE_MAX) {
      return NextResponse.json({ error: `Note must be ${NOTE_MAX} characters or fewer.` }, { status: 400 });
    }

    // CUSTOM exists to say something the four fixed states cannot, so it is the
    // one status where an empty note would leave the customer staring at a
    // badge that tells them nothing.
    if (body.status === "CUSTOM" && !rawNote) {
      return NextResponse.json(
        { error: "A custom status needs the text to show the customer." },
        { status: 400 }
      );
    }

    const updated = await prisma.mobileInquiry
      .update({
        where: { id },
        data: { status: body.status, statusNote: rawNote || null },
        select: { id: true, status: true, statusNote: true, updatedAt: true },
      })
      .catch(() => null);

    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      inquiry: { ...updated, ...describeStatus(updated.status, updated.statusNote) },
    });
  } catch (error) {
    console.error("Admin Mobile Inquiry Status Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
