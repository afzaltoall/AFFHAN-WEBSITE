import { NextResponse } from "next/server";
import { readAdminSession } from "@/lib/session";
import { adminReleaseLead, handlingFor, handlingHistory, type LeadKind } from "@/lib/lead-pool";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };

type AdminAuth = Awaited<ReturnType<typeof readAdminSession>>;

function refusal(auth: Extract<AdminAuth, { ok: false }>) {
  const forbidden = auth.reason === "not_admin";
  return NextResponse.json({ error: forbidden ? "Forbidden" : "Unauthorized" }, { status: forbidden ? 403 : 401, headers: PRIVATE });
}

/** One request of a customer's, as the popup names it: its kind and id. Null for anything else. */
function leadOf(kind: unknown, id: unknown): { kind: LeadKind; id: string } | null {
  if (kind !== "inquiry" && kind !== "contact" && kind !== "shipment") return null;
  if (typeof id !== "string" || !/^[0-9a-f-]{8,64}$/i.test(id)) return null;
  return { kind, id };
}

/**
 * One customer's handling, step by step, for the console's popup: GET ?kind=inquiry|contact|shipment&id=…
 * It arrived, who took it and when, what they recorded, who let it go and why, who took it next, how it ended
 * (lib/lead-pool.ts, handlingHistory). Admins only; asked for when the popup opens, never with the lists.
 */
export async function GET(request: Request) {
  const auth = await readAdminSession();
  if (!auth.ok) return refusal(auth);
  const url = new URL(request.url);
  const lead = leadOf(url.searchParams.get("kind"), url.searchParams.get("id") ?? "");
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404, headers: PRIVATE });
  try {
    const history = await handlingHistory(lead);
    if (!history) return NextResponse.json({ error: "Not found" }, { status: 404, headers: PRIVATE });
    return NextResponse.json(history, { headers: PRIVATE });
  } catch (error) {
    console.error("handling history failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Could not load the history." }, { status: 500, headers: PRIVATE });
  }
}

/**
 * Release to pool, from a lead's popup: { kind, id, action: "release" } puts the customer behind that request back
 * in the open pool, for when the person holding them is away. An administrator's one control over who holds whom;
 * it lived on the Queue page until that went (the owner, 2026-10-22). The same rules as there: the trail logs it as
 * the administrator's doing, and it costs the holder no wait before they may take the customer again. 409 when
 * nobody holds them now; the answer carries where the customer stands after, for the popup and its rows.
 */
export async function POST(request: Request) {
  const auth = await readAdminSession();
  if (!auth.ok) return refusal(auth);
  const body = await request.json().catch(() => ({}));
  if (body?.action !== "release") return NextResponse.json({ error: "action must be release" }, { status: 400, headers: PRIVATE });
  const lead = leadOf(body?.kind, body?.id);
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404, headers: PRIVATE });
  try {
    const result = await adminReleaseLead(lead, auth.user.name || auth.user.email);
    if (!result.ok) return NextResponse.json({ error: "Nobody holds this customer now." }, { status: 409, headers: PRIVATE });
    const handling = result.key ? ((await handlingFor([result.key]))[result.key] ?? null) : null;
    return NextResponse.json({ ok: true, handling }, { headers: PRIVATE });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    console.error("release to pool failed:", error instanceof Error ? error.name : "unknown", code ?? "");
    return NextResponse.json({ error: "Could not do that. Try again." }, { status: 500, headers: PRIVATE });
  }
}
