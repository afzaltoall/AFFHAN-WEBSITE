import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { customerKeyOf } from "@/lib/customerGroups";
import { ensureCustomerCode } from "@/lib/customerCode";
import { validateShipmentInquiry } from "@/lib/shipment-inquiry";

// Public freight-quote endpoint for the /shipping/ page. Stores the request in
// ShipmentInquiry, which the admin console's Shipping Inquiries view reads back.
//
// No sign-in, as on /contact/: a shipping inquiry is a first-touch lead from
// somebody who may not have an account yet, and making them create one first
// would lose most of them before they submitted.
//
// Validation is validateShipmentInquiry, the same function the form runs, so
// the two cannot disagree about what is acceptable. Unlike /contact/, the
// mobile number is checked here as well as in the browser: the form is a
// convenience, not a guarantee, and anyone can POST past it.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Send the request as JSON." }, { status: 400 });
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
