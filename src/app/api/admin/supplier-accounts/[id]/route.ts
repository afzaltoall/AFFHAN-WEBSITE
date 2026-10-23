import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { clearLoginFailures, supplierLoginKey } from "@/lib/password";

export const dynamic = "force-dynamic";

/**
 * A supplier account's switches, from their page in the console. Admins only.
 *
 * - { status: "BLOCKED" | "ACTIVE" }: block or unblock. Blocking bumps tokenVersion, so the supplier is signed out
 *   everywhere at once, not when the cookie lapses; a blocked account cannot sign in or reset its password. Its
 *   applications stay, for the team's record.
 * - { action: "sign-out" }: sign them out everywhere without blocking (2026-10-23): a lost phone, a shared
 *   computer. They sign in again with their password.
 * - { action: "unlock" }: forget their failed sign-ins, so a supplier locked out by mistyping (lib/login-lockout.ts)
 *   can try again now rather than when the wait ends (2026-10-23).
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return new NextResponse("Unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as { status?: unknown; action?: unknown };
  if (body.action === "sign-out" || body.action === "unlock") {
    const account = await prisma.supplierAccount.findUnique({ where: { id }, select: { email: true } });
    if (!account) return NextResponse.json({ error: "Supplier account not found." }, { status: 404 });
    if (body.action === "sign-out") {
      const row = await prisma.supplierAccount.update({ where: { id }, data: { tokenVersion: { increment: 1 } }, select: { id: true } });
      return NextResponse.json({ ...row, signedOut: true });
    }
    await clearLoginFailures(supplierLoginKey(account.email));
    return NextResponse.json({ id, unlocked: true });
  }
  if (body.status !== "ACTIVE" && body.status !== "BLOCKED") {
    return NextResponse.json({ error: "Unknown status." }, { status: 400 });
  }
  try {
    const row = await prisma.supplierAccount.update({
      where: { id },
      data: { status: body.status, ...(body.status === "BLOCKED" ? { tokenVersion: { increment: 1 } } : {}) },
      select: { id: true, status: true },
    });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Supplier account not found." }, { status: 404 });
  }
}
