import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

// Public "Contact Us" form endpoint. Stores a free-form message from the
// contact page into ContactMessage, which the admin console reads back.
// No auth — this is a public form. Basic validation + length caps to keep
// junk out of the DB.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clip = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const firstName = clip(body.firstName, 100);
    const lastName = clip(body.lastName, 100);
    const email = clip(body.email, 200);
    const productName = clip(body.productName, 300);
    const message = clip(body.message, 5000);

    if (!firstName) {
      return NextResponse.json({ error: "First name is required." }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    await prisma.contactMessage.create({
      data: {
        firstName,
        lastName: lastName || null,
        email,
        productName: productName || null,
        message,
      },
    });

    return NextResponse.json(
      { message: "Thanks for reaching out — we'll get back to you soon." },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Error saving contact message:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
