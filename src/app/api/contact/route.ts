import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { customerKeyOf } from "@/lib/customerGroups";
import { ensureCustomerCode } from "@/lib/customerCode";
import { checkContactRateLimit, getClientIp, limitReached } from "@/lib/rate-limit";
import { checkTurnstile } from "@/lib/turnstile";

// Public "Contact Us" form endpoint. Stores a free-form message from the
// contact page into ContactMessage, which the admin console reads back.
// No auth — this is a public form. Basic validation + length caps to keep
// junk out of the DB, and since the security audit (2026-10-08, M7) a
// Turnstile check and two limits, so a script cannot flood the console and
// the customer numbering with it.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Messages one sender (the same email, or the same phone) may send. */
const PER_SENDER = { hour: 3, day: 10 };
const HOUR_MS = 60 * 60 * 1000;
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

    // Scripts first: Cloudflare Turnstile, as the sign-in pages have it
    // (lib/turnstile.ts). Checked after the fields, so a typo does not spend
    // the visitor's token.
    const human = await checkTurnstile(body.turnstileToken, getClientIp(req));
    if (!human.ok) {
      return NextResponse.json({ error: human.error }, { status: human.status });
    }

    // Then volume: five an hour per connection (Upstash, lib/rate-limit.ts),
    // and per sender in the database, which holds with or without Redis.
    const perIp = await checkContactRateLimit(req);
    if (!perIp.success) return limitReached("Several messages have come from this connection in the last hour.", perIp, "You can also WhatsApp or call us.");
    // A message and a quote request from the same number are the same
    // customer — see ContactMessage.customerKey in schema.prisma.
    const customerKey = customerKeyOf({ phone, email });
    const sender = {
      OR: [{ email: { equals: email, mode: "insensitive" as const } }, ...(customerKey ? [{ customerKey }] : [])],
    };
    const now = Date.now();
    const [lastHour, lastDay] = await Promise.all([
      prisma.contactMessage.count({ where: { ...sender, createdAt: { gte: new Date(now - HOUR_MS) } } }),
      prisma.contactMessage.count({ where: { ...sender, createdAt: { gte: new Date(now - 24 * HOUR_MS) } } }),
    ]);
    if (lastHour >= PER_SENDER.hour || lastDay >= PER_SENDER.day) {
      return NextResponse.json(
        { error: "We already have several messages from you. We'll reply to those soon; please try again later." },
        { status: 429 }
      );
    }

    const saved = await prisma.contactMessage.create({
      data: {
        fullName,
        email,
        companyName: companyName || null,
        country,
        phone,
        message,
        customerKey,
      },
    });

    // The same number they would get from a quote request, because it is the
    // same customer — the channel they arrive through does not change who they
    // are. Never fatal: the message is saved either way.
    try {
      await ensureCustomerCode({ phone, email }, saved.createdAt, "CONTACT");
    } catch (e) {
      console.error("customer code:", e);
    }

    return NextResponse.json(
      { message: "Thanks for reaching out — we'll get back to you soon." },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Error saving contact message:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
