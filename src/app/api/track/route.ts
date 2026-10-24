import { NextResponse } from "next/server";
import { trackCargo } from "@/lib/cargo";
import { checkCargoTrackRateLimit, limitReached } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Live: a cached answer would show yesterday's stage. */
const FRESH = { "Cache-Control": "no-store" };

/**
 * Live track & trace (the owner, 2026-10-24): GET /api/track/?ref=<console, FCL or LCL number>. Anyone may ask, so
 * it answers only what the customer is meant to see: the number, the stage, and the timeline of updates (date,
 * what happened, stage). Never the customer, the type, the ports, the sheet's dates or who changed anything
 * (lib/cargo.ts, trackCargo). An unknown number is told only that it was not found, and a per-IP limit keeps
 * anybody from walking the numbers in turn.
 */
export async function GET(request: Request) {
  const ref = new URL(request.url).searchParams.get("ref")?.trim() ?? "";
  if (!ref) return NextResponse.json({ error: "Enter your cargo number." }, { status: 400, headers: FRESH });
  const limit = await checkCargoTrackRateLimit(request);
  if (!limit.success) return limitReached("You have looked up a lot of numbers.", limit);
  try {
    const cargo = await trackCargo(ref);
    if (!cargo) return NextResponse.json({ error: "not_found" }, { status: 404, headers: FRESH });
    return NextResponse.json({ cargo }, { headers: FRESH });
  } catch (error) {
    console.error("track:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "We couldn't look that up just now. Please try again." }, { status: 500, headers: FRESH });
  }
}
