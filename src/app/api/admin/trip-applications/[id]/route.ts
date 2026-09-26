import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** ContactMessage's triage, unchanged: new | handled | spam | deleted. */
const STATUSES = new Set(["new", "handled", "spam", "deleted"]);

/** Change one application's status. Admins only. "deleted" is a soft delete. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { status?: unknown };
  const status = typeof body.status === "string" ? body.status : "";
  if (!STATUSES.has(status)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
  try {
    const row = await prisma.tripApplication.update({ where: { id }, data: { status }, select: { id: true, status: true } });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }
}
