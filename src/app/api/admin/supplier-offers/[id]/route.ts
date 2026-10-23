import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { REPLY_MAX, TEAM_STATUSES, isOfferStatus } from "@/lib/supplier-offer";
import { removeSupplierPhotos } from "@/lib/video-storage";
import { scheduleSupplierNews } from "@/lib/supplier-news";

export const dynamic = "force-dynamic";
// The supplier's email waits for the change to settle (lib/supplier-news.ts) after the answer has gone; this
// keeps the function alive for it.
export const maxDuration = 60;

/**
 * The team's decision on a supplier's application: its status (new, reviewing, accepted, not selected) and a
 * reply the supplier reads beside it. Admins only. An application the supplier withdrew is theirs and stays
 * withdrawn. The supplier is emailed about it once it settles (lib/supplier-news.ts, since 2026-10-23).
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

  // The change's own time: the email it schedules goes only if this is still the latest change when it settles.
  const changedAt = new Date();
  const { count } = await prisma.supplierOffer.updateMany({
    where: { id, status: { not: "WITHDRAWN" } },
    data: { ...data, reviewedAt: changedAt, reviewedBy: admin.email },
  });
  if (count !== 1) {
    const exists = await prisma.supplierOffer.findUnique({ where: { id }, select: { status: true } });
    return exists
      ? NextResponse.json({ error: "The supplier withdrew this application." }, { status: 409 })
      : NextResponse.json({ error: "Application not found." }, { status: 404 });
  }
  scheduleSupplierNews(id, changedAt);
  const row = await prisma.supplierOffer.findUnique({
    where: { id },
    select: { id: true, status: true, reply: true, reviewedAt: true, reviewedBy: true },
  });
  return NextResponse.json(row);
}

/**
 * Delete one application for good, from its review panel (the owner, 2026-10-22). Admins only. Its photos leave
 * the bucket after the row (best effort, removeSupplierPhotos); the supplier's account and their other
 * applications stay.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  try {
    const offer = await prisma.supplierOffer.findUnique({ where: { id }, select: { photos: true } });
    if (!offer) return NextResponse.json({ error: "That application is already deleted." }, { status: 404 });
    await prisma.supplierOffer.delete({ where: { id } });
    const photos = await removeSupplierPhotos(offer.photos);
    return NextResponse.json({ success: true, photos });
  } catch (error) {
    console.error("supplier application delete failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "The application was not deleted. Try again." }, { status: 500 });
  }
}
