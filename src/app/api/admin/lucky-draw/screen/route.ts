import { NextResponse } from "next/server";
import { isDrawMode } from "@/lib/lucky-draw-shared";
import { DRAW_SCREEN_MS } from "@/lib/draw-screen-token";
import { consoleAdmin, openDrawScreen } from "@/lib/server/draw-screen";

export const dynamic = "force-dynamic";

/**
 * Gives this browser the TV screen's pass for one mode (lib/server/draw-screen.ts), from an admin's own session: the
 * screen asks for it as it opens, from the console's "Open the TV screen", and from then on keeps drawing for
 * DRAW_SCREEN_MS whatever the console's session does. Body: { mode }.
 */
export async function POST(req: Request) {
  const admin = await consoleAdmin();
  if (!admin) return NextResponse.json({ error: "Open the screen from the console: Free China Trip → Lucky draw.", reason: "no_pass" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { mode?: unknown };
  if (!isDrawMode(body.mode)) return NextResponse.json({ error: "Which draw: live or rehearsal?" }, { status: 400 });
  const res = NextResponse.json({ mode: body.mode, until: new Date(Date.now() + DRAW_SCREEN_MS).toISOString() }, { headers: { "Cache-Control": "no-store" } });
  if (!(await openDrawScreen(res, admin.id, body.mode))) return new NextResponse("Unauthorized", { status: 401 });
  console.info(`[lucky-draw] ${body.mode} screen opened by ${admin.name}`);
  return res;
}
