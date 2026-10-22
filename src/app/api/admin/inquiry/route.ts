import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ASSIGN_GONE } from "@/lib/lead-pool-rules";
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
// "assign" is gone (2026-10-22): staff take customers from the open pool, and
// it answers 410 with the reason (ASSIGN_GONE) for anything still sending it.
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
    if (action === "assign") return NextResponse.json({ error: ASSIGN_GONE }, { status: 410 });

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
