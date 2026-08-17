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

    const fullName = clip(body.fullName, 100);
    const email = clip(body.email, 200);
    const companyName = clip(body.companyName, 200);
    const country = clip(body.country, 100);
    const phone = clip(body.phone, 50);
    const message = clip(body.message, 5000) || "No message provided.";

    if (!fullName) {
      return NextResponse.json({ error: "Full name is required." }, { status: 400 });
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }
    if (!country) {
      return NextResponse.json({ error: "Country is required." }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
    }

    await prisma.contactMessage.create({
      data: {
        fullName,
        email,
        companyName: companyName || null,
        country,
        phone,
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
