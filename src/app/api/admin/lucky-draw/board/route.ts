import { NextResponse, type NextRequest } from "next/server";
import { isDrawMode } from "@/lib/lucky-draw-shared";
import { drawActor } from "@/lib/server/draw-screen";
import { drawBoard } from "@/lib/server/lucky-draw";

export const dynamic = "force-dynamic";

/**
 * The lucky draw's board in one mode (?mode=live|rehearsal): the console's, with every detail, to an admin's session;
 * the TV screen's, with only what may be shown publicly (no mobile number), to the screen's pass, or to anyone who asks
 * for it with ?view=screen (the screen does, so it never holds a mobile number even on an admin's own laptop).
 */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode");
  if (!isDrawMode(mode)) return NextResponse.json({ error: "Which draw: live or rehearsal?" }, { status: 400 });
  const actor = await drawActor(mode);
  if (!actor) return NextResponse.json({ error: "Open the screen from the console: Free China Trip → Lucky draw.", reason: "no_pass" }, { status: 401 });
  const forScreen = actor.kind === "screen" || req.nextUrl.searchParams.get("view") === "screen";
  try {
    const board = forScreen ? await drawBoard(mode, false) : await drawBoard(mode, true);
    return NextResponse.json(board, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("lucky draw board:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not read the draw." }, { status: 500 });
  }
}
