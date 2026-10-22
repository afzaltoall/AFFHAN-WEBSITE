import { NextResponse } from "next/server";
import { readAdminSession } from "@/lib/session";
import { supplierMatchesFor } from "@/lib/server/supplier-match";

export const dynamic = "force-dynamic";

const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * Suppliers from the old suppliers book who could source the inquired product, for the console's inquiry panel
 * (src/lib/server/supplier-match). Admins only, for any inquiry: no session is a 401, a session that is not an
 * admin's a 403. Staff ask for their own leads at /api/employee/inquiries/[id]/supplier-matches. Supplier names,
 * numbers and WeChat IDs go to the admin's browser in the answer and nowhere else; each view is logged with who,
 * which inquiry and when, and a failure logs its kind only.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await readAdminSession();
  if (!auth.ok) {
    const forbidden = auth.reason === "not_admin";
    return NextResponse.json({ error: forbidden ? "Forbidden" : "Unauthorized" }, { status: forbidden ? 403 : 401, headers: PRIVATE });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{8,64}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404, headers: PRIVATE });

  try {
    const result = await supplierMatchesFor(id, { kind: "admin" });
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404, headers: PRIVATE });
    console.info(`supplier matches viewed: admin ${auth.user.id}, inquiry ${id}, ${new Date().toISOString()}`);
    return NextResponse.json(result, { headers: PRIVATE });
  } catch (error) {
    console.error("Supplier matches failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Could not load matching suppliers" }, { status: 500, headers: PRIVATE });
  }
}
