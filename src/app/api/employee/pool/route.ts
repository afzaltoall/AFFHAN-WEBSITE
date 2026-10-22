import { NextResponse } from "next/server";
import { readEmployeeAuth } from "@/lib/employee-session";
import { listPool } from "@/lib/lead-pool";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * The open pool, for a member of staff: every customer nobody holds, newest request first, with how many the reader
 * holds against the cap and when they may take back anyone they let go too recently.
 *
 * What it carries is what the pool may show and nothing more: the customer's AFFHAN number, the products' titles
 * and photographs, quantities, country, when each request arrived and what kind it is. Never a name, number, email,
 * company or message: lib/lead-pool.ts never reads them for the pool. A customer is known here by their place in
 * the pool, not by their customer key, which is their phone number. The staff workspace renders the same list
 * itself; this is the same answer as JSON.
 */
export async function GET() {
  const auth = await readEmployeeAuth();
  if (!auth.ok) return NextResponse.json({ error: "Not signed in", reason: auth.reason }, { status: 401, headers: PRIVATE });
  try {
    return NextResponse.json(await listPool(auth.employee.id), { headers: PRIVATE });
  } catch (error) {
    console.error("pool list failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Could not load the open pool." }, { status: 500, headers: PRIVATE });
  }
}
