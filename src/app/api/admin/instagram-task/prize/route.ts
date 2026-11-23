import { NextResponse } from "next/server";
import { giveInstagramPrize } from "@/lib/server/instagram-task";
import { instagramErrorResponse, readInstagramAdmin } from "@/lib/server/instagram-auth";

export const dynamic = "force-dynamic";

/**
 * Records an employee's prize as given: only someone whose every account is checked done (worked out again on the
 * server), once each, at today's amount. Admins only: it is money.
 */
export async function POST(req: Request) {
  const who = await readInstagramAdmin();
  if (!who.ok) return who.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.employeeId !== "string" || !body.employeeId) return NextResponse.json({ error: "Say whose prize." }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().replace(/\s+/g, " ").slice(0, 200) || null : null;
  try {
    return NextResponse.json(await giveInstagramPrize(body.employeeId, note, who.actor.name));
  } catch (e) {
    return instagramErrorResponse(e);
  }
}
