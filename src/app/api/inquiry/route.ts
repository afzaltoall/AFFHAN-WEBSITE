import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { verifyMobileSession } from "@/lib/mobile-auth";

/**
 * A quote request from the website's "Inquire Now" modal.
 *
 * SIGN-IN REQUIRED. This route was open to anyone until 2026-09-15, and the
 * reasoning for that is worth keeping because it was not an oversight:
 * sourcing leads are the point of this site, and at the time the gate went in,
 * 240 of the 250 inquiries on record had no account attached. Requiring a
 * session turns those away.
 *
 * It was changed on an explicit product decision taken with that number in
 * view. If it is ever reversed, the client-side gate in
 * src/context/QuoteGateContext.tsx has to come out with it — a server that
 * accepts anonymous posts behind a UI that refuses them is the worst of both.
 *
 * The check is here and not only in the UI because a client-side gate is
 * decoration: /api/inquiry is a public URL and anyone can post to it directly.
 *
 * The form's own name/email/phone are still stored as typed rather than
 * overwritten from the account. Someone signed in as themselves may well be
 * inquiring on behalf of a colleague, and silently replacing what they entered
 * with their profile would send the quote to the wrong person.
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

    // A bad session and no session are now the same answer: 401. An expired
    // session gets it too, which is correct — the browser still holds the
    // cookie, so the UI would otherwise submit a form it cannot save and show
    // a success it did not get.
    const user = await verifyMobileSession(req).catch(() => null);
    if (!user) {
      return NextResponse.json(
        { error: "Sign in to request a quote" },
        { status: 401 }
      );
    }

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
        userId: user.id,
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
