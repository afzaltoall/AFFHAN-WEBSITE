import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSupplier, setSupplierCookie } from "@/lib/supplier-session";
import {
  beginLoginAttempt,
  checkPasswordStrength,
  clearLoginFailures,
  hashPassword,
  supplierLoginKey,
  verifyPasswordOrNothing,
} from "@/lib/password";
import { lockedMessage } from "@/lib/login-lockout";

export const dynamic = "force-dynamic";

/**
 * Change a signed-in supplier's password, with the current one.
 *
 * A wrong current password counts against the sign-in's lockout (supplierLoginKey): a session left open on a
 * shared computer must not become a way to guess the password at leisure. tokenVersion is bumped, which signs
 * out every other device, and this one is signed in again on the new version, so the supplier stays where
 * they are.
 */
export async function POST(request: Request) {
  const supplier = await readSupplier();
  if (!supplier) return NextResponse.json({ error: "Your session has ended. Sign in again.", reason: "signed_out" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";

    if (!currentPassword) return NextResponse.json({ error: "Enter your current password.", field: "currentPassword" }, { status: 400 });
    const strength = checkPasswordStrength(newPassword);
    if (!strength.ok) return NextResponse.json({ error: strength.error, field: "newPassword" }, { status: 400 });

    const key = supplierLoginKey(supplier.email);
    const gate = await beginLoginAttempt(key);
    if (gate.locked) {
      return NextResponse.json({ error: lockedMessage(gate.retryAfterMs), reason: "locked" }, { status: 429 });
    }

    const row = await prisma.supplierAccount.findUnique({ where: { id: supplier.id }, select: { passwordHash: true } });
    if (!(await verifyPasswordOrNothing(currentPassword, row?.passwordHash))) {
      return NextResponse.json({ error: "That isn't your current password.", field: "currentPassword" }, { status: 400 });
    }
    await clearLoginFailures(key);

    const updated = await prisma.supplierAccount.update({
      where: { id: supplier.id },
      data: { passwordHash: await hashPassword(newPassword), tokenVersion: { increment: 1 } },
      select: { id: true, tokenVersion: true },
    });
    return setSupplierCookie(NextResponse.json({ success: true }), updated);
  } catch (error) {
    console.error("Supplier password change error:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
