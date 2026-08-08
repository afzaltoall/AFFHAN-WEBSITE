import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

const ALLOWED_STATUS = ["new", "handled", "spam"] as const;

// Set an inquiry's triage status: new | handled | spam (fake customer).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const status = (ALLOWED_STATUS as readonly string[]).includes(body?.status) ? body.status : "new";
  try {
    const updated = await prisma.inquiry.update({ where: { id }, data: { status } });
    return NextResponse.json({ id: updated.id, status: updated.status });
  } catch (e) {
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
  } catch (e) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
