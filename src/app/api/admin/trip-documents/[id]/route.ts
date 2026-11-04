import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { documentViewUrl } from "@/lib/server/trip-documents";
import { idProofsOpenUntil } from "@/lib/server/id-proof-lock";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * A browser opening the link as a page of its own (a tab), not the console asking for a tile's picture. Browsers say
 * so in Sec-Fetch-Dest; one that does not is read by what it accepts.
 */
function opensAsPage(req: Request): boolean {
  const dest = req.headers.get("sec-fetch-dest");
  return dest ? dest === "document" : (req.headers.get("accept") ?? "").includes("text/html");
}

/**
 * Opens one applicant's ID proof (2026-11-02): administrators only, and only once they have opened ID proofs with
 * their password (2026-11-04, lib/server/id-proof-lock.ts), sent on to the private bucket through a link good for a
 * minute (lib/server/trip-documents.ts). The console's Participants panel and Employee tasks link here; the file's own
 * address is never shown, so there is nothing to pass on that outlives the minute.
 *
 * A tab that cannot have the file yet (signed out, ID proofs locked, or no such file) goes to the console's page for it
 * (admin/(console)/id-proof/[id]), which asks for the password and comes back here, rather than read a line of JSON
 * (2026-11-04, the owner: "showing like this how can i see": a console tab from before the lock still linked here
 * directly). Never for an error of the bucket's: that page would only send it back.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const door = () =>
    NextResponse.redirect(new URL(`/admin/id-proof/${encodeURIComponent(id)}/`, req.url), { status: 303, headers: { "Cache-Control": "no-store" } });
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return opensAsPage(req) ? door() : new NextResponse("Unauthorized", { status: 401 });
  if (!(await idProofsOpenUntil(admin))) {
    if (opensAsPage(req)) return door();
    return NextResponse.json(
      { error: "ID proofs are locked. Open them with your password in the console.", locked: true },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const doc = await prisma.tripApplicationDocument.findUnique({ where: { id }, select: { key: true, contentType: true } });
    if (!doc) return opensAsPage(req) ? door() : NextResponse.json({ error: "Document not found." }, { status: 404 });
    const url = await documentViewUrl(doc.key, doc.contentType);
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (e) {
    console.error("trip document view:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not open the document." }, { status: 500 });
  }
}
