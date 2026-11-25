import { NextResponse, type NextRequest } from "next/server";
import { isDrawMode } from "@/lib/lucky-draw-shared";
import { consoleAdmin } from "@/lib/server/draw-screen";
import { drawPeople } from "@/lib/server/lucky-draw";

export const dynamic = "force-dynamic";

/**
 * Everyone who can be drawn in one mode (?mode=live|rehearsal), for the console's Lucky draw list (the owner,
 * 2026-11-25: "show the overall the list of lucky draw set persons to see"): each one's application, Trip ID, name,
 * city, country, mobile and when they applied. The admin's own session only, never the TV screen's pass: the TV's list
 * (../pool) has no mobile numbers.
 */
export async function GET(req: NextRequest) {
  const admin = await consoleAdmin();
  if (!admin) return new NextResponse("Unauthorized", { status: 401 });
  const mode = req.nextUrl.searchParams.get("mode");
  if (!isDrawMode(mode)) return NextResponse.json({ error: "Which draw: live or rehearsal?" }, { status: 400 });
  try {
    return NextResponse.json(await drawPeople(mode), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("lucky draw people:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Could not read who is in the draw." }, { status: 500 });
  }
}
