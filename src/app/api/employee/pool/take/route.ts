import { NextResponse } from "next/server";
import { readEmployeeAuth } from "@/lib/employee-session";
import { takeCustomer } from "@/lib/lead-pool";
import { formatDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * Take a customer from the open pool: { entryId }, their place in it.
 *
 *   200  taken: every request and message of theirs is the reader's now
 *   409  somebody else took them first: "Already taken by <first name>"
 *   403  the reader holds as many open customers as anyone may, or let this one go too recently to take them back
 *        before the next office day
 *   404  not in the pool any more (decided, given up on, or never there)
 *
 * The claim is one conditional update (lib/lead-pool.ts, takeCustomer), so two people pressing Take together get
 * one 200 and one 409. Staff only: administrators neither take customers nor hand them out; Release to pool, in the
 * console's popup, is their one control.
 */
export async function POST(request: Request) {
  const auth = await readEmployeeAuth();
  if (!auth.ok) return NextResponse.json({ error: "Not signed in", reason: auth.reason }, { status: 401, headers: PRIVATE });

  const body = await request.json().catch(() => ({}));
  const entryId = typeof body?.entryId === "string" && /^[0-9a-f-]{8,64}$/i.test(body.entryId) ? body.entryId : null;
  if (!entryId) return NextResponse.json({ error: "Not found" }, { status: 404, headers: PRIVATE });

  try {
    const result = await takeCustomer({ entryId, employee: { id: auth.employee.id, name: auth.employee.name } });
    switch (result.outcome) {
      case "taken":
        return NextResponse.json({ ok: true, code: result.code, leads: result.leads }, { headers: PRIVATE });
      case "already":
        return NextResponse.json({ error: `Already taken by ${result.by}`, by: result.by }, { status: 409, headers: PRIVATE });
      case "cap":
        return NextResponse.json(
          { error: `You hold ${result.held} open customers, the most anyone may. Record an outcome for one, or release one, to take another.`, reason: "cap", held: result.held, cap: result.cap },
          { status: 403, headers: PRIVATE },
        );
      case "cooldown":
        return NextResponse.json(
          { error: `You let this customer go recently. You can take them again from ${formatDateTime(result.until)}.`, reason: "cooldown", until: result.until },
          { status: 403, headers: PRIVATE },
        );
      default:
        return NextResponse.json({ error: "This customer is no longer in the pool." }, { status: 404, headers: PRIVATE });
    }
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    console.error("pool take failed:", error instanceof Error ? error.name : "unknown", code ?? "");
    return NextResponse.json({ error: "Could not take this customer. Try again." }, { status: 500, headers: PRIVATE });
  }
}
