import { NextResponse } from "next/server";
import { consoleAdmin } from "@/lib/server/draw-screen";
import { drawBoard, drawModeOf, releaseDraw, restoreDraw } from "@/lib/server/lucky-draw";

export const dynamic = "force-dynamic";

/**
 * Someone drawn can't take part (the owner, 2026-11-10: "if someone says they can't, we spin again"): released, their
 * seat opening for the next draw, which fills it first (Terms clause 4); or a release made by mistake, undone.
 * The admin's own session only, never the TV screen's pass. Body: { id, action: "release" | "restore", note? }.
 */
export async function POST(req: Request) {
  const admin = await consoleAdmin();
  if (!admin) return new NextResponse("Unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; action?: unknown; note?: unknown };
  if (typeof body.id !== "string" || !body.id || (body.action !== "release" && body.action !== "restore")) {
    return NextResponse.json({ error: "That change could not be read." }, { status: 400 });
  }
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;
  try {
    const mode = await drawModeOf(body.id);
    if (!mode) return NextResponse.json({ error: "That draw is not there any more." }, { status: 404 });
    const changed = body.action === "release" ? await releaseDraw(body.id, admin.name, note) : await restoreDraw(body.id);
    if (changed) console.info(`[lucky-draw] ${mode} draw ${body.action === "release" ? "released" : "restored"} by ${admin.name}`);
    return NextResponse.json({ changed, board: await drawBoard(mode, true) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("lucky draw release:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "That could not be saved. Try again." }, { status: 500 });
  }
}
