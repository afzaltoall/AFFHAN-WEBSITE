import { NextResponse, type NextRequest } from "next/server";
import { isDrawMode } from "@/lib/lucky-draw-shared";
import { consoleAdmin } from "@/lib/server/draw-screen";
import { clearDraws, drawBoard } from "@/lib/server/lucky-draw";

export const dynamic = "force-dynamic";

/**
 * Every draw of one mode cleared (?mode=live|rehearsal), so its next draw starts again from seat 1: the rehearsal's
 * after practice, the live draw's after a test on the live screen (the owner, 2026-11-27: "even im a admin if i want to
 * test in live draw also"). The other mode and the seat given before the draw are never touched. The admin's own
 * session only, never the TV's pass.
 */
export async function DELETE(req: NextRequest) {
  const admin = await consoleAdmin();
  if (!admin) return new NextResponse("Unauthorized", { status: 401 });
  const mode = req.nextUrl.searchParams.get("mode");
  if (!isDrawMode(mode)) return NextResponse.json({ error: "Which draw: live or rehearsal?" }, { status: 400 });
  const words = mode === "live" ? "The live draw" : "The rehearsal";
  try {
    const cleared = await clearDraws(mode);
    console.info(`[lucky-draw] ${mode} cleared by ${admin.name} (${cleared})`);
    return NextResponse.json({ cleared, board: await drawBoard(mode, true) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(`lucky draw ${mode} clear:`, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: `${words} could not be cleared. Try again.` }, { status: 500 });
  }
}
