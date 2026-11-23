import { NextResponse } from "next/server";
import { setInstagramTracker } from "@/lib/server/instagram-task";
import { instagramErrorResponse, readInstagramAdmin } from "@/lib/server/instagram-auth";

export const dynamic = "force-dynamic";

/**
 * Who checks everyone's accounts besides the admins (the owner: HR, "hr track pana maari access kudu"):
 * { employeeId, tracker: true } gives an employee the task's board on their staff page, false takes it back. Admins only.
 */
export async function POST(req: Request) {
  const who = await readInstagramAdmin();
  if (!who.ok) return who.response;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.employeeId !== "string" || !body.employeeId || typeof body.tracker !== "boolean") {
    return NextResponse.json({ error: "Say who, and whether they track." }, { status: 400 });
  }
  try {
    await setInstagramTracker(body.employeeId, body.tracker, who.actor.name);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return instagramErrorResponse(e);
  }
}
