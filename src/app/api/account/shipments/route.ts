import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMobileSession } from "@/lib/mobile-auth";
import type { AccountShipment } from "@/lib/shipment-inquiry";

export const dynamic = "force-dynamic";

/**
 * The freight quotes this customer has sent from /shipping/, newest first, for
 * the account's My Shipments page.
 *
 * Only rows that carry their account id. Requests from before the id was
 * stored have none and are not shown: they are not guessed at by matching
 * email addresses (Inquiry.userId's rule), because an address typed on
 * somebody else's request would show this customer that request.
 *
 * Only what the customer sent, plus the reference and the date. The triage
 * status, the assigned employee and the customer key are the office's, and
 * none of them is a stage the customer moves through.
 */
export async function GET(request: Request) {
  try {
    const user = await verifyMobileSession(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const rows = await prisma.shipmentInquiry.findMany({
      // Deleted in the console is gone from the customer's list too, as a
      // deleted Inquiry is from My Inquiries.
      where: { userId: user.id, status: { not: "deleted" } },
      orderBy: { createdAt: "desc" },
      select: {
        referenceNo: true,
        createdAt: true,
        customerName: true,
        phone: true,
        email: true,
        country: true,
        commodity: true,
        commodityType: true,
        mode: true,
        method: true,
        portOfLoading: true,
        portOfDischarge: true,
        terms: true,
        cbm: true,
        weightKg: true,
        cartonBoxes: true,
        notes: true,
      },
    });

    const shipments: AccountShipment[] = rows.map((s) => ({
      ...s,
      createdAt: s.createdAt.toISOString(),
      // Decimals as their exact text, as the console reads them.
      cbm: s.cbm.toString(),
      weightKg: s.weightKg.toString(),
    }));

    return NextResponse.json({ shipments });
  } catch (error) {
    console.error("Account Shipments List Error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
