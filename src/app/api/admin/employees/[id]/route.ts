import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { checkPasswordStrength, hashPassword } from "@/lib/password";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? admin : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DETAIL_SELECT = {
  id: true,
  email: true,
  name: true,
  image: true,
  role: true,
  region: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { assignedInquiries: true, assignedContacts: true, statusUpdates: true } },
} satisfies Prisma.EmployeeSelect;

/** One employee, with the work attached to them. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const employee = await prisma.employee.findUnique({ where: { id }, select: DETAIL_SELECT });
  if (!employee) return NextResponse.json({ error: "No such employee." }, { status: 404 });

  // Both halves of the audit trail, newest first. Empty until phases 4 and 5
  // put assignment and status updates in front of the sales team.
  const updates = await prisma.statusUpdate.findMany({
    where: { employeeId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      status: true,
      note: true,
      createdAt: true,
      // The two lead tables name their person differently.
      inquiry: { select: { id: true, customerName: true, productName: true, email: true } },
      contact: { select: { id: true, fullName: true, email: true } },
    },
  });

  return NextResponse.json({ employee, updates });
}

/**
 * Change an employee.
 *
 * Every field is optional: the form sends what it changed. Two of them have
 * consequences beyond the row — a new password and a deactivation both bump
 * tokenVersion, which is what makes lib/employee-session.ts refuse the cookies
 * already issued to that person rather than waiting for them to lapse.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const data: Prisma.EmployeeUpdateInput = {};
    let newPassword: string | null = null;

    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
      data.name = name;
    }
    if (typeof body?.email === "string") {
      const email = body.email.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
      data.email = email;
    }
    if (body?.region !== undefined) {
      const region = typeof body.region === "string" ? body.region.trim() : "";
      data.region = region || null;
    }
    if (body?.image !== undefined) {
      const image = typeof body.image === "string" ? body.image.trim() : "";
      data.image = image || null;
    }
    if (body?.role !== undefined) {
      if (body.role !== "ADMIN" && body.role !== "EMPLOYEE") {
        return NextResponse.json({ error: "Rank must be ADMIN or EMPLOYEE." }, { status: 400 });
      }
      data.role = body.role;
    }
    if (body?.isActive !== undefined) {
      const isActive = Boolean(body.isActive);
      data.isActive = isActive;
      // Switching somebody off has to sign them out of the sessions they
      // already hold; switching them back on does not invalidate anything.
      if (!isActive) data.tokenVersion = { increment: 1 };
    }
    if (typeof body?.password === "string" && body.password !== "") {
      const strength = checkPasswordStrength(body.password);
      if (!strength.ok) return NextResponse.json({ error: strength.error }, { status: 400 });
      newPassword = body.password;
      data.passwordHash = await hashPassword(body.password);
      data.tokenVersion = { increment: 1 };
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const employee = await prisma.employee.update({ where: { id }, data, select: DETAIL_SELECT });

    // Somebody switched off keeps nothing.
    //
    // Deactivating already signs them out and takes them out of the rotation's
    // pool. What it did not do was let go of the leads they were holding,
    // which left those customers assigned to an account that cannot sign in —
    // invisible on every workspace, and not unassigned either, so nobody was
    // going to pick them up. The console's assign refuses to hand a lead to a
    // deactivated employee for exactly this reason; this closes the same gap
    // from the other end.
    let released = 0;
    if (body?.isActive !== undefined && !Boolean(body.isActive)) {
      const [inquiries, contacts] = await Promise.all([
        prisma.inquiry.updateMany({
          where: { assignedToId: id, status: { not: "deleted" } },
          data: { assignedToId: null, assignedAt: null },
        }),
        prisma.contactMessage.updateMany({
          where: { assignedToId: id, status: { not: "deleted" } },
          data: { assignedToId: null, assignedAt: null },
        }),
      ]);
      released = inquiries.count + contacts.count;
      // A customer they were holding for the queue is now held by nobody, so
      // the queue has to know: parked, and on the Queue page where an
      // administrator will see it, rather than rotating from a ghost.
      await prisma.leadQueueEntry.updateMany({
        where: { currentEmployeeId: id, state: "ROTATING" },
        data: { currentEmployeeId: null, lastEmployeeId: id, nextRotationAt: null },
      });
    }

    return NextResponse.json({ employee, passwordChanged: newPassword !== null, released });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json({ error: "A staff account already uses that email." }, { status: 409 });
      }
      if (error.code === "P2025") {
        return NextResponse.json({ error: "No such employee." }, { status: 404 });
      }
    }
    console.error("update employee error", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
