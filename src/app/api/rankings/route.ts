import { NextResponse } from "next/server";
import { getCachedRankings, DEFAULT_GROUP_LIMIT } from "@/lib/rankings";
import { MODERATION_SENSITIVE_CACHE_CONTROL } from "@/lib/cacheTags";

// Thin wrapper over src/lib/rankings.ts. The query and its cache live there
// so that /rankings/ can server-render its first screen by calling the same
// function directly instead of fetching this endpoint from the browser.

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId"); // selected top-level category (optional)
    const tab = searchParams.get("tab") === "popular" ? "popular" : "hot";
    const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0);
    const limit = Math.min(
      30,
      Math.max(1, parseInt(searchParams.get("limit") || String(DEFAULT_GROUP_LIMIT), 10) || DEFAULT_GROUP_LIMIT)
    );

    const payload = await getCachedRankings(tab, offset, limit, parentId);
    // The edge cache in front of unstable_cache, for the same reason the
    // categories route has one: force-dynamic still wakes the function and
    // re-serialises the body for every caller.
    return NextResponse.json(payload, {
      headers: { "Cache-Control": MODERATION_SENSITIVE_CACHE_CONTROL },
    });
  } catch (error) {
    console.error("Failed to build rankings:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error", groups: [], hasMore: false },
      { status: 500 }
    );
  }
}

