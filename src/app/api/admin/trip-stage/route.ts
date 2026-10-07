import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { asTripStage, setTripStage, tripStage } from "@/lib/trip-stage";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

/** The trip's stage (lib/trip-stage.ts), for the console: where it stands, and who last moved it. */
export async function GET() {
  if (!(await requireAdmin())) return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json(await tripStage(), { headers: { "Cache-Control": "no-store" } });
}

/**
 * { stage } moves the trip to that stage: every participant's "What happens
 * next" follows within seconds (it is read with the board). Admins only.
 */
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return new NextResponse("Unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { stage?: unknown };
  const stage = asTripStage(body.stage);
  if (!stage) return NextResponse.json({ error: "Unknown stage." }, { status: 400 });
  try {
    return NextResponse.json(await setTripStage(stage, admin.email), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("trip stage change failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "That change did not save. Try again." }, { status: 500 });
  }
}
