import { NextRequest, NextResponse } from "next/server";
import { getHomeGrid } from "@/lib/homeGrid";
import { MODERATION_SENSITIVE_CACHE_CONTROL } from "@/lib/cacheTags";

/**
 * The homepage grid's cards after the ones the page carries (lib/homeGrid.ts),
 * for the section, which reads them as they come near: ?from= is how many the
 * page already has. Read from the same hourly cache the page reads, and
 * moderated as the page is, so it keeps the same short edge life.
 */
export async function GET(req: NextRequest) {
  const from = Math.max(0, Math.floor(Number(req.nextUrl.searchParams.get("from"))) || 0);
  try {
    const cards = await getHomeGrid();
    return NextResponse.json({ cards: cards.slice(from) }, { headers: { "Cache-Control": MODERATION_SENSITIVE_CACHE_CONTROL } });
  } catch (e) {
    console.error("home grid failed", e);
    // The page keeps the cards it has, and offers to try again.
    return NextResponse.json({ cards: [] }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
