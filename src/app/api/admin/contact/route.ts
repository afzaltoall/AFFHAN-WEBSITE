import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

// Bulk contact-message actions (also used for single-row actions — the client
// always sends an array). Mirrors /api/admin/inquiry:
//   { ids: string[], action: "delete" | "restore" | "purge" | "status", status?: "new"|"handled"|"spam" }
// delete/restore/status are status flips (nothing lost); "purge" removes rows.
const TRIAGE = ["new", "handled", "spam"] as const;

export async function POST(req: Request) {
  if (!(await requireAdmin())) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ids: unknown = body?.ids;
  const action: unknown = body?.action;

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === "string")) {
    return NextResponse.json({ error: "ids must be a non-empty string array" }, { status: 400 });
  }
  if (action !== "delete" && action !== "restore" && action !== "purge" && action !== "status") {
    return NextResponse.json({ error: "action must be delete | restore | purge | status" }, { status: 400 });
  }

  try {
    if (action === "purge") {
      const { count } = await prisma.contactMessage.deleteMany({ where: { id: { in: ids as string[] } } });
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
    const { count } = await prisma.contactMessage.updateMany({
      where: { id: { in: ids as string[] } },
      data: { status },
    });
    return NextResponse.json({ ok: true, action, status, count });
  } catch {
    return NextResponse.json({ error: "Bulk action failed" }, { status: 500 });
  }
}
