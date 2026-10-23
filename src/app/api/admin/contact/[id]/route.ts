import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { applyConsoleTriage, customerKeysOf, heldAmong } from "@/lib/lead-pool";
import { heldByMessage } from "@/lib/handling";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

const ALLOWED_STATUS = ["new", "handled", "spam"] as const;

// Set a contact message's triage status: new | handled | spam. The bulk
// route's rules (/api/admin/contact): Handled on a held customer answers 409,
// and the pool applies the triage to the customer afterwards.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const status = (ALLOWED_STATUS as readonly string[]).includes(body?.status) ? body.status : "new";
  try {
    const keys = await customerKeysOf("contact", [id]);
    if (status === "handled") {
      const held = await heldAmong(keys);
      if (held.length) return NextResponse.json({ error: heldByMessage(held.map((h) => h.holder ?? ""), held.length) }, { status: 409 });
    }
    const updated = await prisma.contactMessage.update({ where: { id }, data: { status } });
    await applyConsoleTriage(keys, admin.name || admin.email);
    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

// Permanently remove a contact message.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  try {
    const keys = await customerKeysOf("contact", [id]);
    await prisma.contactMessage.delete({ where: { id } });
    await applyConsoleTriage(keys, admin.name || admin.email);
    return NextResponse.json({ ok: true, id });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
