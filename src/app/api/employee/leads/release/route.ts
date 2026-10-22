import { NextResponse } from "next/server";
import { readEmployeeAuth } from "@/lib/employee-session";
import { releaseCustomer, type LeadRef } from "@/lib/lead-pool";
import { RELEASE_REASON_MAX } from "@/lib/lead-pool-config";
import { POOL_EVENT } from "@/lib/lead-pool-rules";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * Release: a customer the reader holds goes back to the open pool. { leads: [{ kind, id }], reason? }, the leads of
 * the customer card they pressed it on; the customer is found from them, and all of theirs go back together.
 *
 * Only the holder can: anyone else gets a 404, the same answer as for a lead that does not exist. The optional reason
 * is kept on the trail for the office (Activity, the person's page); staff do not see each other's. The one who
 * released may not take the customer back until the next office day; anybody else may at once.
 */
export async function POST(request: Request) {
  const auth = await readEmployeeAuth();
  if (!auth.ok) return NextResponse.json({ error: "Not signed in", reason: auth.reason }, { status: 401, headers: PRIVATE });

  const body = await request.json().catch(() => ({}));
  const raw: unknown[] = Array.isArray(body?.leads) ? body.leads.slice(0, 100) : [];
  const leads: LeadRef[] = raw.flatMap((l) => {
    const kind = (l as LeadRef)?.kind;
    const id = (l as LeadRef)?.id;
    return (kind === "inquiry" || kind === "contact" || kind === "shipment") && typeof id === "string" && id ? [{ kind, id }] : [];
  });
  if (leads.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404, headers: PRIVATE });
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (reason.length > RELEASE_REASON_MAX) {
    return NextResponse.json({ error: `Keep the reason under ${RELEASE_REASON_MAX} characters.` }, { status: 400, headers: PRIVATE });
  }

  try {
    const result = await releaseCustomer({
      leads,
      employee: { id: auth.employee.id, name: auth.employee.name },
      kind: POOL_EVENT.RELEASED,
      reason: reason || null,
    });
    if (result.outcome !== "released") return NextResponse.json({ error: "That customer is not yours to release." }, { status: 404, headers: PRIVATE });
    return NextResponse.json({ ok: true }, { headers: PRIVATE });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    console.error("pool release failed:", error instanceof Error ? error.name : "unknown", code ?? "");
    return NextResponse.json({ error: "Could not release this customer. Try again." }, { status: 500, headers: PRIVATE });
  }
}
