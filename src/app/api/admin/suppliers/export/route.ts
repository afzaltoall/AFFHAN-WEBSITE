import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { toSupplierRecord } from "@/lib/suppliers";
import { buildSupplierWorkbook, exportFilename } from "@/lib/supplierExport";

export const dynamic = "force-dynamic";

const SELECT = {
  id: true, sourceRow: true, serial: true, personName: true,
  companyName: true, productsRaw: true, address: true, contactRaw: true,
} as const;

/**
 * Build the supplier book as an .xlsx.
 *
 * The caller sends the ids it wants, in the order it wants them — the directory
 * filters and sorts in the browser, and re-implementing that here would be two
 * copies of the same rules waiting to drift apart. An empty or absent list
 * means "everything", in sheet order.
 *
 * POST rather than GET because a selection can run to hundreds of ids, which is
 * more than a query string should carry.
 */
export async function POST(request: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  let ids: number[] = [];
  try {
    const body = await request.json();
    if (Array.isArray(body?.ids)) {
      ids = body.ids
        .map((v: unknown) => Number.parseInt(String(v), 10))
        .filter((n: number) => Number.isInteger(n) && n > 0)
        // The whole book is 845 rows; anything beyond that is not a real
        // request, so it is capped rather than trusted.
        .slice(0, 5000);
    }
  } catch {
    // No body at all is a valid way of asking for everything.
  }

  const rows = await prisma.supplier.findMany({
    where: ids.length ? { id: { in: ids } } : undefined,
    orderBy: [{ serial: "asc" }, { sourceRow: "asc" }],
    select: SELECT,
  });

  if (!rows.length) {
    return NextResponse.json({ error: "Nothing to export." }, { status: 404 });
  }

  const file = buildSupplierWorkbook(rows.map(toSupplierRecord));

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFilename(ids.length > 0)}"`,
      "Content-Length": String(file.length),
      // The supplier book is the most sensitive list on this site; it should
      // never sit in a shared cache.
      "Cache-Control": "no-store, private",
    },
  });
}
