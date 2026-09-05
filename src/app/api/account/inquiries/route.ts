import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMobileSession } from "@/lib/mobile-auth";
import { describeStatus, type InquirySource } from "@/lib/inquiry-status";

export const dynamic = "force-dynamic";

/**
 * Every quote request this customer has raised, from either client, in one list.
 *
 * Affhan stores inquiries in two tables — Inquiry for the website's "Inquire
 * Now" modal, MobileInquiry for the app — and they are staying separate: the
 * app's table is a shipped API contract, and merging them would migrate live
 * data to solve a problem that only exists on this one page. So the merge
 * happens here instead, at read time, and both are flattened to one row shape
 * so a single step-tracker can render them.
 *
 * This route previously authenticated with getCurrentUser() from lib/session —
 * the ADMIN cookie — and then selected a "userId" column that did not exist. It
 * therefore failed on every call, and nothing called it. Both halves are fixed
 * here rather than the file being deleted, because a customer-facing endpoint
 * under /api/account is where this belongs; the page used to borrow
 * /api/mobile/inquiries, which could only ever show it half its inquiries.
 */

interface MergedRow {
  id: string;
  source: InquirySource;
  productId: number | null;
  productName: string;
  productImage: string | null;
  requestedMOQ: number;
  status: string;
  label: string;
  message: string;
  note: string | null;
  /** What the customer typed on the website form. The app has no such field. */
  customerNote: string | null;
  createdAt: string;
  /** Null while nothing has happened yet — see the note below. */
  statusChangedAt: string | null;
}

export async function GET(request: Request) {
  try {
    const user = await verifyMobileSession(request);
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const [webRows, appRows] = await Promise.all([
      prisma.inquiry.findMany({
        // Anonymous rows have a null userId and are unreachable here by
        // construction — a null never equals a session id.
        where: { userId: user.id, status: { not: "deleted" } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          productId: true,
          productName: true,
          quantity: true,
          message: true,
          customerStatus: true,
          statusNote: true,
          statusUpdatedAt: true,
          createdAt: true,
          // The website table copies the product's name but not its image, so
          // the picture has to come off the relation. Only imageUrl — pulling
          // the whole Product would drag the allImages JSON along with it.
          product: { select: { imageUrl: true } },
        },
      }),
      prisma.mobileInquiry.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          productId: true,
          productName: true,
          productImage: true,
          requestedMOQ: true,
          status: true,
          statusNote: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const web: MergedRow[] = webRows.map((i) => ({
      id: i.id,
      source: "WEBSITE",
      productId: i.productId,
      productName: i.productName,
      productImage: i.product?.imageUrl ?? null,
      // The website form calls it a quantity and the app calls it a requested
      // MOQ. Same number, and the tracker should not have to care which.
      requestedMOQ: i.quantity,
      ...describeStatus(i.customerStatus, i.statusNote),
      customerNote: i.message?.trim() || null,
      createdAt: i.createdAt.toISOString(),
      // Null until an admin actually moves it, which is why the column is
      // nullable: "submitted and untouched" must not render as "updated".
      statusChangedAt: i.statusUpdatedAt?.toISOString() ?? null,
    }));

    const app: MergedRow[] = appRows.map((i) => ({
      id: i.id,
      source: "APP",
      productId: i.productId,
      productName: i.productName,
      productImage: i.productImage,
      requestedMOQ: i.requestedMOQ,
      ...describeStatus(i.status, i.statusNote),
      customerNote: null,
      createdAt: i.createdAt.toISOString(),
      // MobileInquiry.updatedAt moves for any edit, including the customer's
      // own quantity changes, so it is only reported as a status change once
      // something has actually moved off the default. Otherwise a brand-new
      // inquiry would claim to have been "updated" the second it was made.
      statusChangedAt:
        i.status !== "PENDING" || i.statusNote ? i.updatedAt.toISOString() : null,
    }));

    // One list, newest first, regardless of which client raised it.
    const inquiries = [...web, ...app].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ inquiries });
  } catch (error) {
    console.error("Account Inquiries List Error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
