import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

// Public "job alerts" subscription endpoint for the Careers page. Stores the
// email into JobAlert, which the admin console reads back under "Careers".
// No auth — public form. Basic email validation only.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : "";

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
    }

    await prisma.jobAlert.create({ data: { email } });

    return NextResponse.json(
      { message: "You're on the list — we'll email you when a role opens up." },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Error saving job alert:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
