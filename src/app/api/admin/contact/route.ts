import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyConsoleTriage, customerKeysOf, heldAmong } from "@/lib/lead-pool";
import { heldByMessage } from "@/lib/handling";
import { ASSIGN_GONE } from "@/lib/lead-pool-rules";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

// Bulk contact-message actions (also used for single-row actions — the client
// always sends an array). Mirrors /api/admin/inquiry:
//   { ids: string[], action: "delete" | "restore" | "purge" | "status", status?: "new"|"handled"|"spam" }
// "assign" is gone, as on the inquiry route: 410 with the reason. Handled on a
// held customer answers 409, as there.
// delete/restore/status are status flips (nothing lost); "purge" removes rows.
const TRIAGE = ["new", "handled", "spam"] as const;

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return new NextResponse("Unauthorized", { status: 401 });

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

    // Whose requests these are, read before the change (a purge removes the rows): the pool then applies its rule to
    // them at once (lib/lead-pool.ts, reconsiderTriage). Nothing left to handle, out of the pool; something to handle
    // again, back in.
    const keys = await customerKeysOf("contact", ids as string[]);
    const by = admin.name || admin.email;

    if (action === "purge") {
      const { count } = await prisma.contactMessage.deleteMany({ where: { id: { in: ids as string[] } } });
      await applyConsoleTriage(keys, by);
      return NextResponse.json({ ok: true, action, count });
    }
    let status: string;
    if (action === "status") {
      if (!(TRIAGE as readonly string[]).includes(body?.status)) {
        return NextResponse.json({ error: "status must be new | handled | spam" }, { status: 400 });
      }
      status = body.status;
      // A held customer is closed by the person holding them, with Lead or No lead (the owner, 2026-10-22). Spam and
      // delete still end the hold.
      if (status === "handled") {
        const held = await heldAmong(keys);
        if (held.length) return NextResponse.json({ error: heldByMessage(held.map((h) => h.holder ?? ""), held.length) }, { status: 409 });
      }
    } else {
      status = action === "delete" ? "deleted" : "new"; // restore -> new
    }
    const { count } = await prisma.contactMessage.updateMany({
      where: { id: { in: ids as string[] } },
      data: { status },
    });
    await applyConsoleTriage(keys, by);
    return NextResponse.json({ ok: true, action, status, count });
  } catch {
    return NextResponse.json({ error: "Bulk action failed" }, { status: 500 });
  }
}
