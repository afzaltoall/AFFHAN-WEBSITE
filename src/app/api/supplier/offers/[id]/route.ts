import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSupplier } from "@/lib/supplier-session";
import { checkSupplierApplyRateLimit, limitReached } from "@/lib/rate-limit";
import { OPEN_STATUSES } from "@/lib/supplier-offer";

export const dynamic = "force-dynamic";

/**
 * Withdraw one of the supplier's own applications, while it is still open (sent, or being reviewed). The only
 * change a supplier makes to an application once sent: the team's decision is the team's, and an application
 * they have decided on stays as it was decided.
 */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const supplier = await readSupplier();
  if (!supplier) return NextResponse.json({ error: "Your session has ended. Sign in again.", reason: "signed_out" }, { status: 401 });

  const limit = await checkSupplierApplyRateLimit(supplier.id);
  if (!limit.success) return limitReached("You have made a lot of changes in the last hour.", limit);

  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  if (body?.status !== "WITHDRAWN") return NextResponse.json({ error: "Applications can only be withdrawn." }, { status: 400 });

  // One statement: the row must be theirs and still open, so two clicks, or a click racing the team's
  // decision, cannot both win.
  const { count } = await prisma.supplierOffer.updateMany({
    where: { id, supplierId: supplier.id, status: { in: [...OPEN_STATUSES] } },
    data: { status: "WITHDRAWN" },
  });
  if (count !== 1) {
    return NextResponse.json({ error: "This application has already been decided, so it can't be withdrawn." }, { status: 409 });
  }
  return NextResponse.json({ success: true, status: "WITHDRAWN" });
}
