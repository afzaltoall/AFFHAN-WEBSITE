import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { customerKeyOf } from "@/lib/customerGroups";
import { ensureCustomerCode } from "@/lib/customerCode";
import { validateShipmentInquiry } from "@/lib/shipment-inquiry";
import { verifyMobileSession } from "@/lib/mobile-auth";

// The freight-quote endpoint for the /shipping/ page. Stores the request in
// ShipmentInquiry, which the admin console's Shipping view reads back.
//
// SIGN-IN REQUIRED, on the owner's decision of 2026-09-24, the same rule as a
// product quote (/api/inquiry). It opened without one, as /contact/ does. The
// form enforces it through the sign-in gate on its send button
// (QuoteGateContext); this check is the one that counts, because the route is
// a public URL and anyone can post to it directly.
//
// Who signed in is checked, not stored: ShipmentInquiry has no userId column
// yet. The name, phone and email are kept as typed, as on /api/inquiry, since
// someone signed in may be asking on a colleague's behalf.
//
// Validation is validateShipmentInquiry, the same function the form runs, so
// the two cannot disagree about what is acceptable.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Send the request as JSON." }, { status: 400 });
    }

    // No session and an expired one get the same answer. The form reopens the
    // sign-in on a 401 and sends again once it is real.
    const user = await verifyMobileSession(req).catch(() => null);
    if (!user) {
      return NextResponse.json({ error: "Sign in to send a freight request." }, { status: 401 });
    }

    const result = validateShipmentInquiry(body);
    if (!result.ok) {
      // Per field, so the form can put each message beside the input it is
      // about rather than in one box at the bottom.
      return NextResponse.json(
        { error: "Some details need another look.", fields: result.errors },
        { status: 400 }
      );
    }
    const v = result.value;

    const saved = await prisma.shipmentInquiry.create({
      data: {
        ...v,
        // A freight request, a quote request and a message from the same number
        // are the same customer: see ShipmentInquiry in schema.prisma.
        customerKey: customerKeyOf({ phone: v.phone, email: v.email }),
      },
      select: { referenceNo: true, createdAt: true },
    });

    // The number they would get through any other door, because it is the same
    // customer. Never fatal: the request is saved either way.
    try {
      await ensureCustomerCode({ phone: v.phone, email: v.email }, saved.createdAt, "SHIPPING");
    } catch (e) {
      console.error("customer code:", e);
    }

    return NextResponse.json({ referenceNo: saved.referenceNo }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error saving shipment inquiry:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
