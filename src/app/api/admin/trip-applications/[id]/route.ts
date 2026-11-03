import { NextResponse } from "next/server";
import { prisma, withDbRetry } from "@/lib/prisma";
import { ADMIN_APPLICATION_INCLUDE, forConsole } from "@/lib/server/trip-admin-rows";
import { getCurrentUser } from "@/lib/session";
import { idProofOfKey } from "@/lib/trip-referral-shared";

export const dynamic = "force-dynamic";

/**
 * One application in full, for the console's panel (the list carries only what its rows show). Admins only. A deleted
 * one too: the board's Deleted tab opens them, and choosing New, Handled or Spam there restores one (PATCH below).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  try {
    const row = await withDbRetry(() =>
      prisma.tripApplication.findFirst({
        where: { id },
        // Its ID proof, when it came through an employee's link (2026-11-02): what each file is, opened through
        // /api/admin/trip-documents/[id], never its key.
        include: { ...ADMIN_APPLICATION_INCLUDE, documents: { select: { id: true, key: true, contentType: true, size: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
      }),
    );
    if (!row) return NextResponse.json({ error: "Application not found." }, { status: 404 });
    const [a] = await forConsole([row]);
    // Each file as the console shows it: which ID it is (from its key), never the key.
    return NextResponse.json({ ...a, documents: row.documents.map((d) => ({ id: d.id, contentType: d.contentType, size: d.size, proof: idProofOfKey(d.key) })) });
  } catch (e) {
    console.error("admin trip application:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not load the application." }, { status: 500 });
  }
}

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
