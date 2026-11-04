import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { setEmployeeTarget } from "@/lib/server/trip-referrals";

export const dynamic = "force-dynamic";

/** The task's own target is held to the same range (api/admin/trip-referrals/settings). */
const TARGET_MAX = 100_000;

/**
 * Give one employee a target of their own, or put them back on the task's: { employeeId, target } with target a whole
 * number from 1, or null for the task's (the owner, 2026-11-04: "give an access option to increase a target for a
 * particular employee"). lib/server/trip-referrals.ts keeps it (setEmployeeTarget). Admins only.
 */
export async function POST(req: Request) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { employeeId?: unknown; target?: unknown };
  if (typeof body.employeeId !== "string" || !body.employeeId) return NextResponse.json({ error: "Send the employee and the target." }, { status: 400 });
  const target = body.target;
  if (target !== null && !(typeof target === "number" && Number.isInteger(target) && target >= 1 && target <= TARGET_MAX)) {
    return NextResponse.json({ error: `A target is a whole number from 1 to ${TARGET_MAX.toLocaleString("en-IN")}.` }, { status: 400 });
  }
  try {
    const employee = await prisma.employee.findUnique({ where: { id: body.employeeId }, select: { id: true } });
    if (!employee) return NextResponse.json({ error: "That employee is no longer here." }, { status: 404 });
    await setEmployeeTarget(employee.id, target, admin.name || admin.email);
    return NextResponse.json({ target });
  } catch (e) {
    console.error("trip referral target:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The target was not saved. Try again." }, { status: 500 });
  }
}
