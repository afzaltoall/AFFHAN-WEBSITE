import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Block or unblock a supplier account. Admins only. Blocking bumps tokenVersion, so the supplier is signed out
 * everywhere at once, not when the cookie lapses; a blocked account cannot sign in or reset its password.
 * Its applications stay, for the team's record.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as { status?: unknown };
  if (body.status !== "ACTIVE" && body.status !== "BLOCKED") {
    return NextResponse.json({ error: "Unknown status." }, { status: 400 });
  }
  try {
    const row = await prisma.supplierAccount.update({
      where: { id },
      data: { status: body.status, ...(body.status === "BLOCKED" ? { tokenVersion: { increment: 1 } } : {}) },
      select: { id: true, status: true },
    });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Supplier account not found." }, { status: 404 });
  }
}
