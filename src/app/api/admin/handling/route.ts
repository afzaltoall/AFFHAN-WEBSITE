import { NextResponse } from "next/server";
import { readAdminSession } from "@/lib/session";
import { handlingHistory, type LeadKind } from "@/lib/lead-pool";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * One customer's handling, step by step, for the console's popup: GET ?kind=inquiry|contact|shipment&id=…
 * It arrived, who took it and when, what they recorded, who let it go and why, who took it next, how it ended
 * (lib/lead-pool.ts, handlingHistory). Admins only; asked for when the popup opens, never with the lists.
 */
export async function GET(request: Request) {
  const auth = await readAdminSession();
  if (!auth.ok) {
    const forbidden = auth.reason === "not_admin";
    return NextResponse.json({ error: forbidden ? "Forbidden" : "Unauthorized" }, { status: forbidden ? 403 : 401, headers: PRIVATE });
  }
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const id = url.searchParams.get("id") ?? "";
  if ((kind !== "inquiry" && kind !== "contact" && kind !== "shipment") || !/^[0-9a-f-]{8,64}$/i.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: PRIVATE });
  }
  try {
    const history = await handlingHistory({ kind: kind as LeadKind, id });
    if (!history) return NextResponse.json({ error: "Not found" }, { status: 404, headers: PRIVATE });
    return NextResponse.json(history, { headers: PRIVATE });
  } catch (error) {
    console.error("handling history failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Could not load the history." }, { status: 500, headers: PRIVATE });
  }
}
