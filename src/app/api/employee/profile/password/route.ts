import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readEmployeeAuth, refreshEmployeeCookie } from "@/lib/employee-session";
import {
  checkPasswordStrength,
  clearLoginFailures,
  countRecentLoginFailures,
  hashPassword,
  LOGIN_MAX_FAILURES,
  recordLoginFailure,
  verifyPassword,
} from "@/lib/password";

export const dynamic = "force-dynamic";

/**
 * Change your own password.
 *
 * The current password is required even though the session is valid: a
 * session is a cookie on a machine that might be unattended, and the password
 * is the thing that outlives it. Wrong guesses count against the same
 * per-address limit the login uses, so this cannot be used to try passwords
 * faster than the front door allows.
 *
 * A change bumps tokenVersion, which signs out every other device holding this
 * account — the point of changing a password you think someone else knows —
 * and this device is re-issued a cookie at the new version so the person who
 * made the change is not thrown out by it.
 */
export async function POST(request: Request) {
  const auth = await readEmployeeAuth();
  if (!auth.ok) {
    return NextResponse.json({ error: "Not signed in", reason: auth.reason }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const current = typeof body?.current === "string" ? body.current : "";
  const next = typeof body?.next === "string" ? body.next : "";
  if (!current || !next) {
    return NextResponse.json({ error: "Enter your current password and a new one." }, { status: 400 });
  }

  const email = auth.employee.email.toLowerCase();
  if ((await countRecentLoginFailures(email)) >= LOGIN_MAX_FAILURES) {
    return NextResponse.json(
      { error: "Too many wrong attempts. Wait fifteen minutes and try again." },
      { status: 429 }
    );
  }

  const row = await prisma.employee.findUnique({
    where: { id: auth.employee.id },
    select: { passwordHash: true },
  });
  if (!row || !(await verifyPassword(current, row.passwordHash))) {
    await recordLoginFailure(email);
    return NextResponse.json({ error: "That is not your current password." }, { status: 400 });
  }

  const strength = checkPasswordStrength(next);
  if (!strength.ok) return NextResponse.json({ error: strength.error }, { status: 400 });
  if (await verifyPassword(next, row.passwordHash)) {
    return NextResponse.json({ error: "Choose a password different from the one you have now." }, { status: 400 });
  }

  const updated = await prisma.employee.update({
    where: { id: auth.employee.id },
    data: { passwordHash: await hashPassword(next), tokenVersion: { increment: 1 } },
    select: { tokenVersion: true },
  });
  await clearLoginFailures(email);

  return refreshEmployeeCookie(
    NextResponse.json({ ok: true }),
    {
      id: auth.employee.id,
      email: auth.employee.email,
      name: auth.employee.name,
      image: auth.employee.image,
    },
    updated.tokenVersion
  );
}
