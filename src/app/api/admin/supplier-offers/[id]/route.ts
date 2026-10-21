import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { REPLY_MAX, TEAM_STATUSES, isOfferStatus } from "@/lib/supplier-offer";

export const dynamic = "force-dynamic";

/**
 * The team's decision on a supplier's application: its status (new, reviewing, accepted, not selected) and a
 * reply the supplier reads beside it. Admins only. An application the supplier withdrew is theirs and stays
 * withdrawn.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as { status?: unknown; reply?: unknown };
  const data: { status?: string; reply?: string | null } = {};
  if (body.status !== undefined) {
    if (!isOfferStatus(body.status) || !TEAM_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body.reply !== undefined) {
    const reply = typeof body.reply === "string" ? body.reply.replace(/\r\n?/g, "\n").trim() : "";
    if (reply.length > REPLY_MAX) return NextResponse.json({ error: `Keep the reply under ${REPLY_MAX} characters.` }, { status: 400 });
    data.reply = reply || null;
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const { count } = await prisma.supplierOffer.updateMany({
    where: { id, status: { not: "WITHDRAWN" } },
    data: { ...data, reviewedAt: new Date(), reviewedBy: admin.email },
  });
  if (count !== 1) {
    const exists = await prisma.supplierOffer.findUnique({ where: { id }, select: { status: true } });
    return exists
      ? NextResponse.json({ error: "The supplier withdrew this application." }, { status: 409 })
      : NextResponse.json({ error: "Application not found." }, { status: 404 });
  }
  const row = await prisma.supplierOffer.findUnique({
    where: { id },
    select: { id: true, status: true, reply: true, reviewedAt: true, reviewedBy: true },
  });
  return NextResponse.json(row);
}
