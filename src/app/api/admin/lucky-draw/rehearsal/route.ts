import { NextResponse } from "next/server";
import { consoleAdmin } from "@/lib/server/draw-screen";
import { clearRehearsal, drawBoard } from "@/lib/server/lucky-draw";

export const dynamic = "force-dynamic";

/** Every rehearsal draw cleared, so the next practice starts again from seat 1. Live draws are never touched. The
 *  admin's own session only. */
export async function DELETE() {
  const admin = await consoleAdmin();
  if (!admin) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const cleared = await clearRehearsal();
    console.info(`[lucky-draw] rehearsal cleared by ${admin.name} (${cleared})`);
    return NextResponse.json({ cleared, board: await drawBoard("rehearsal", true) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("lucky draw rehearsal clear:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The rehearsal could not be cleared. Try again." }, { status: 500 });
  }
}
