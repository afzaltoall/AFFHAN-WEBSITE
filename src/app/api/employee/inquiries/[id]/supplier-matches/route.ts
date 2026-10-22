import { NextResponse } from "next/server";
import { readEmployeeAuth } from "@/lib/employee-session";
import { supplierMatchesFor } from "@/lib/server/supplier-match";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * Suppliers from the old suppliers book for one of the reader's own leads, for the inquiry panel in the staff
 * workspace (CustomerDetail). The console's answer (src/lib/server/supplier-match), with one rule more: the inquiry
 * must be assigned to this employee now, checked on every request as a condition of the lookup. Another person's,
 * nobody's, one reassigned since the panel opened, a deleted one or a guessed id: all the same 404, which says
 * nothing about whether the inquiry exists. No staff session is a 401. Each view is logged with the employee, the
 * inquiry and the time; no supplier detail is logged.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await readEmployeeAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Not signed in", reason: auth.reason }, { status: 401, headers: PRIVATE });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{8,64}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404, headers: PRIVATE });

  try {
    const result = await supplierMatchesFor(id, { kind: "employee", employeeId: auth.employee.id });
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404, headers: PRIVATE });
    console.info(`supplier matches viewed: employee ${auth.employee.id}, inquiry ${id}, ${new Date().toISOString()}`);
    return NextResponse.json(result, { headers: PRIVATE });
  } catch (error) {
    console.error("Supplier matches failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Could not load matching suppliers" }, { status: 500, headers: PRIVATE });
  }
}
