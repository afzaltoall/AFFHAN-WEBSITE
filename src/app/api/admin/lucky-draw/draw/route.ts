import { NextResponse } from "next/server";
import { isDrawMode } from "@/lib/lucky-draw-shared";
import { drawActor } from "@/lib/server/draw-screen";
import { drawBoard, drawOne } from "@/lib/server/lucky-draw";
import { applicationWindow } from "@/lib/trip-application";
import { TRIP_FACTS } from "@/lib/trip-legal";

export const dynamic = "force-dynamic";

const PRESS = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Draw one person (the owner, 2026-11-10: "our CEO will click draw the lucky person"), in `mode`, for the press
 * `requestId`: the TV screen's pass for that mode or an admin's session. The same press sent again is answered with
 * the draw it made (lib/server/lucky-draw.ts). Answers with the draw's id and the board as the caller may see it.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { mode?: unknown; requestId?: unknown; view?: unknown };
  if (!isDrawMode(body.mode) || typeof body.requestId !== "string" || !PRESS.test(body.requestId)) {
    return NextResponse.json({ error: "That draw could not be read." }, { status: 400 });
  }
  const mode = body.mode;
  const actor = await drawActor(mode);
  if (!actor) return NextResponse.json({ error: "Open the screen from the console: Free China Trip → Lucky draw.", reason: "no_pass" }, { status: 401 });
  // No live draw while applications are open (Terms: everyone who applies by the close is in the draw). A development
  // server counts them as always open (applicationWindow), so a localhost on the live database can only rehearse.
  if (mode === "live" && applicationWindow() !== "closed") {
    return NextResponse.json(
      { error: `The live draw opens when applications close on ${TRIP_FACTS.applicationsClose}. Rehearse until then.`, reason: "applications_open" },
      { status: 409 },
    );
  }
  try {
    const by = actor.kind === "screen" ? `${actor.name} (TV screen)` : actor.name;
    const drawn = await drawOne(mode, body.requestId.toLowerCase(), by);
    if (!drawn.ok) {
      if (drawn.reason === "empty") return NextResponse.json({ error: "Everyone in the draw has been drawn.", reason: "empty" }, { status: 409 });
      return NextResponse.json({ error: "The draw is not set up on this database yet.", reason: "not_ready" }, { status: 503 });
    }
    if (!drawn.again) console.info(`[lucky-draw] ${mode} draw by ${by}`);
    const forScreen = actor.kind === "screen" || body.view === "screen";
    const board = forScreen ? await drawBoard(mode, false) : await drawBoard(mode, true);
    return NextResponse.json({ drawId: drawn.id, again: drawn.again, board }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("lucky draw:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The draw could not be made. Try again." }, { status: 500 });
  }
}
