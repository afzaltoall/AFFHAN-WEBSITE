import crypto from "crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { checkPasswordStrength, hashPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

/**
 * Staff accounts, for the admin console.
 *
 * Admin only — `role === "admin"`, not merely "has a session": employees hold
 * the same cookie shape, and this is the route that creates staff accounts and
 * sets their passwords.
 */
async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A password to read down the phone or paste into a message.
 *
 * Ambiguous characters are left out — no O/0, no l/1/I — because this one is
 * transcribed by a person at least once, and "was that an ell or a one" is a
 * support call. Twelve characters from this alphabet is ~62 bits, and one of
 * each class is forced so it always satisfies checkPasswordStrength.
 */
function generatePassword(): string {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = lower + upper + digits;
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  const chars = [pick(upper), pick(lower), pick(digits), ...Array.from({ length: 9 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const LIST_SELECT = {
  id: true,
  email: true,
  name: true,
  image: true,
  role: true,
  region: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  _count: { select: { assignedInquiries: true, assignedContacts: true, statusUpdates: true } },
} satisfies Prisma.EmployeeSelect;

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const employees = await prisma.employee.findMany({
    // Active first, then by name: a deactivated colleague is history, not
    // something to scroll past every time.
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: LIST_SELECT,
  });

  return NextResponse.json({
    employees: employees.map((e) => ({
      ...e,
      assignedLeads: e._count.assignedInquiries + e._count.assignedContacts,
      statusUpdates: e._count.statusUpdates,
    })),
  });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const region = typeof body?.region === "string" && body.region.trim() ? body.region.trim() : null;
    const image = typeof body?.image === "string" && body.image.trim() ? body.image.trim() : null;
    const rank = body?.role === "ADMIN" ? "ADMIN" : "EMPLOYEE";
    const wantsGenerated = body?.password === undefined || body?.password === null || body?.password === "";

    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

    const password = wantsGenerated ? generatePassword() : String(body.password);
    if (!wantsGenerated) {
      const strength = checkPasswordStrength(password);
      if (!strength.ok) return NextResponse.json({ error: strength.error }, { status: 400 });
    }

    const employee = await prisma.employee.create({
      data: { name, email, region, image, role: rank, passwordHash: await hashPassword(password) },
      select: LIST_SELECT,
    });

    // The only time the password is ever in a response. It is not stored in
    // readable form and cannot be shown again — the admin either passes it on
    // now or resets it later.
    return NextResponse.json({
      employee: { ...employee, assignedLeads: 0, statusUpdates: 0 },
      password,
      generated: wantsGenerated,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A staff account already uses that email." }, { status: 409 });
    }
    // The name only: a Prisma error prints the arguments of the call that
    // failed, and one of them here is a password hash.
    console.error("create employee error", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
