import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { checkLimit, limiterUnavailable, limitReached } from "@/lib/rate-limit";
import { beginLoginAttempt, clearLoginFailures, verifyPasswordOrNothing } from "@/lib/password";
import { waitPhrase } from "@/lib/login-lockout";
import { ID_PROOF_UNLOCK_MS } from "@/lib/id-proof-lock-token";
import { idProofLockKey, idProofsOpenUntil, lockIdProofs, openIdProofs } from "@/lib/server/id-proof-lock";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The ID proof lock (2026-11-04, the owner: "with a password, a strong lock, access only for admin"; see
 * lib/server/id-proof-lock.ts). GET says whether this admin's ID proofs are open and until when; POST opens them for
 * ten minutes with the admin's own password; DELETE locks them again at once.
 */
export async function GET() {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  const until = await idProofsOpenUntil(admin);
  return NextResponse.json({ open: until !== null, until }, { headers: NO_STORE });
}

/**
 * The password, checked as the sign-in checks it, counted per admin apart from their sign-in: a limit that fails
 * closed, and the database lockout (five wrong passwords lock it for fifteen minutes, each five after that for twice as
 * long). A wrong one is 403, never 401, which the console reads as a session that has ended.
 */
export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "admin" || typeof admin.tokenVersion !== "number") {
    return NextResponse.json({ error: "Your admin session has ended. Sign in again." }, { status: 401, headers: NO_STORE });
  }
  const limit = await checkLimit("idProofUnlock", admin.id);
  if (limit.unavailable) return limiterUnavailable("Opening ID proofs");
  if (!limit.success) return limitReached("There have been a lot of tries to open ID proofs.", limit);

  const body = (await request.json().catch(() => ({}))) as { password?: unknown };
  if (typeof body.password !== "string" || !body.password) return NextResponse.json({ error: "Type your password." }, { status: 400, headers: NO_STORE });

  const key = idProofLockKey(admin.id);
  const gate = await beginLoginAttempt(key);
  if (gate.locked) {
    return NextResponse.json(
      { error: `Too many wrong passwords. Try again in ${waitPhrase(gate.retryAfterMs)}.` },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(Math.ceil(gate.retryAfterMs / 1000)) } },
    );
  }
  const row = await prisma.adminUser.findUnique({ where: { id: admin.id }, select: { passwordHash: true, tokenVersion: true } });
  const ok = await verifyPasswordOrNothing(body.password, row?.passwordHash);
  if (!row || !ok || row.tokenVersion !== admin.tokenVersion) {
    return NextResponse.json({ error: "That is not your password." }, { status: 403, headers: NO_STORE });
  }
  await clearLoginFailures(key);

  const now = Date.now();
  const res = NextResponse.json({ open: true, until: now + ID_PROOF_UNLOCK_MS }, { headers: NO_STORE });
  openIdProofs(res, { id: admin.id, tokenVersion: row.tokenVersion }, now);
  return res;
}

/** Lock now. Never refused, signed in or not: locking can only make things safer. */
export async function DELETE() {
  const res = NextResponse.json({ open: false, until: null }, { headers: NO_STORE });
  lockIdProofs(res);
  return res;
}
