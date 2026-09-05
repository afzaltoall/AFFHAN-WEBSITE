import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { verifyMobileSession } from "@/lib/mobile-auth";

/**
 * A quote request from the website's "Inquire Now" modal.
 *
 * Open to anyone. Sourcing leads are the point of this site and most of them
 * arrive from visitors who have never made an account, so a session is read
 * only to attribute the inquiry — never to gate it. Logged out, `userId` stays
 * null and everything else behaves exactly as it did before.
 *
 * The form's own name/email/phone are stored as typed rather than overwritten
 * from the account. Someone signed in as themselves may well be inquiring on
 * behalf of a colleague, and silently replacing what they entered with their
 * profile would send the quote to the wrong person.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { productId, productName, quantity, customerName, companyName, email, country, phone, message } = body;

    if (!productName || !quantity || !customerName || !country || !phone) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Never throws the request away over a bad session: a signed-out visitor
    // and a visitor whose session has expired both just submit anonymously.
    const user = await verifyMobileSession(req).catch(() => null);

    const newInquiry = await prisma.inquiry.create({
      data: {
        productId: productId ? parseInt(productId, 10) : undefined,
        productName,
        quantity: parseInt(quantity, 10),
        customerName,
        companyName,
        email,
        country,
        phone,
        message,
        // The whole point of the linkage: this is what lets the customer see
        // the inquiry again on /account/inquiries.
        userId: user?.id ?? null,
        // Opens the trail so the history reads from the beginning rather than
        // starting at whatever the first admin happened to do. Nested, so it is
        // the same round trip and cannot leave an inquiry with no first event.
        statusEvents: {
          create: { toStatus: "PENDING", note: "Inquiry submitted" },
        },
      },
    });

    return NextResponse.json(
      { message: "Inquiry saved successfully", inquiry: newInquiry },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Error saving inquiry:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "Internal Server Error", details: errorMessage },
      { status: 500 }
    );
  }
}
