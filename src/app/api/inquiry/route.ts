import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { customerKeyOf } from "@/lib/customerGroups";
import { ensureCustomerCode } from "@/lib/customerCode";
import { verifyMobileSession } from "@/lib/mobile-auth";
import { describeInquiryProblems, inquiryInput } from "@/lib/inquiry-input";

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
    // Types, lengths and formats, in lib/inquiry-input.ts (security audit
    // 2026-10-08, M6). Keys it does not name are dropped.
    const parsed = inquiryInput.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(describeInquiryProblems(parsed.error), { status: 400 });
    }
    const { productId, productName, quantity, customerName, companyName, email, country, phone, message } = parsed.data;

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
        productId,
        productName,
        quantity,
        customerName,
        companyName,
        email,
        country,
        phone,
        message,
        // Which customer this is, decided once here rather than recomputed by
        // everything that reads it. See Inquiry.customerKey in schema.prisma.
        customerKey: customerKeyOf({ phone, email }),
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
      select: { id: true, createdAt: true },
    });

    // Their AFFHAN number, issued now if this is the first we have heard from
    // them and left alone if it is not. Never fatal: the inquiry is saved, and
    // the rotation job re-runs the issuing for anyone it finds without one.
    try {
      await ensureCustomerCode({ phone, email }, newInquiry.createdAt, "INQUIRY");
    } catch (e) {
      console.error("customer code:", e);
    }

    // The new row's id and nothing else. The whole row used to come back,
    // internal fields (customerKey, assignedToId, status) included; the quote
    // form reads none of it, only the status. Inquiries have no reference
    // number of their own (freight requests and trip applications do), so
    // there is none to send.
    return NextResponse.json({ id: newInquiry.id }, { status: 201 });
  } catch (error: unknown) {
    // The whole error stays in the server's log. It used to go back as
    // `details`, which handed Prisma's message (table, column and value) to
    // whoever sent a bad quantity or product id.
    console.error("Error saving inquiry:", error);
    return NextResponse.json({ error: "We couldn't save your request. Please try again." }, { status: 500 });
  }
}
