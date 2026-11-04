import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { documentViewUrl } from "@/lib/server/trip-documents";
import { idProofsOpenUntil } from "@/lib/server/id-proof-lock";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Opens one applicant's ID proof (2026-11-02): administrators only, and only once they have opened ID proofs with
 * their password (2026-11-04, lib/server/id-proof-lock.ts), sent on to the private bucket through a link good for a
 * minute (lib/server/trip-documents.ts). The console's Participants panel and Employee tasks link here; the file's own
 * address is never shown, so there is nothing to pass on that outlives the minute.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  if (!(await idProofsOpenUntil(admin))) {
    return NextResponse.json(
      { error: "ID proofs are locked. Open them with your password in the console.", locked: true },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  const { id } = await ctx.params;
  try {
    const doc = await prisma.tripApplicationDocument.findUnique({ where: { id }, select: { key: true, contentType: true } });
    if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });
    const url = await documentViewUrl(doc.key, doc.contentType);
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (e) {
    console.error("trip document view:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not open the document." }, { status: 500 });
  }
}
