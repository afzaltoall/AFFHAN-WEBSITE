import { NextResponse, type NextRequest } from "next/server";
import { isDrawMode } from "@/lib/lucky-draw-shared";
import { drawActor } from "@/lib/server/draw-screen";
import { drawPool } from "@/lib/server/lucky-draw";

export const dynamic = "force-dynamic";

/**
 * Everyone who can be drawn in one mode (?mode=live|rehearsal), in the order the draw puts them, for the TV screen's
 * list that scrolls past the arrow and stops on the person drawn (the owner, 2026-11-10). Trip ID, name, city and
 * country only, never a mobile number (the trip's Privacy Policy, section 12). The screen's pass for that mode, or an
 * admin's session.
 */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode");
  if (!isDrawMode(mode)) return NextResponse.json({ error: "Which draw: live or rehearsal?" }, { status: 400 });
  const actor = await drawActor(mode);
  if (!actor) return NextResponse.json({ error: "Open the screen from the console: Free China Trip → Lucky draw.", reason: "no_pass" }, { status: 401 });
  try {
    return NextResponse.json(await drawPool(mode), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("lucky draw pool:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not read who is in the draw." }, { status: 500 });
  }
}
