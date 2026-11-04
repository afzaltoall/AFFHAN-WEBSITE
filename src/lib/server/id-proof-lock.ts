import "server-only";
import type { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authSecret, authSecretOrNull } from "@/lib/secrets";
import type { SessionUser } from "@/lib/session-token";
import { ID_PROOF_UNLOCK_MS, readIdProofUnlock, signIdProofUnlock } from "@/lib/id-proof-lock-token";

/**
 * The ID proof lock (2026-11-04): applicants' ID proofs open only after the admin types their password again, for ten
 * minutes (lib/id-proof-lock-token.ts says how the token is made). The unlock is a cookie of its own: httpOnly,
 * same-site only, and sent to nothing but the ID proof routes (its path), so no other page or script ever carries it.
 * /api/admin/trip-documents/[id] refuses a file without it; /api/admin/trip-documents/unlock/ opens, reports and locks.
 */
export const ID_PROOF_COOKIE = "affhan_id_proofs";
const COOKIE_PATH = "/api/admin/trip-documents";

const cookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: COOKIE_PATH,
};

/** The admin's wrong passwords here, counted apart from their sign-in's (lib/password.ts's lockout). */
export const idProofLockKey = (adminId: string) => `idproofs:${adminId}`;

/** When this admin's ID proofs lock again, or null while they are locked. The admin is the one getCurrentUser read,
 *  so their tokenVersion is the account's current one: an unlock from before a password change stays locked. */
export async function idProofsOpenUntil(admin: SessionUser): Promise<number | null> {
  const store = await cookies();
  const claims = readIdProofUnlock(store.get(ID_PROOF_COOKIE)?.value, authSecretOrNull());
  if (!claims) return null;
  if (claims.adminId !== admin.id || claims.tokenVersion !== admin.tokenVersion) return null;
  return claims.expiresAt;
}

/** Opens ID proofs for this admin, for ID_PROOF_UNLOCK_MS from now. Returns when they lock again. */
export function openIdProofs(res: NextResponse, admin: { id: string; tokenVersion: number }, now: number = Date.now()): number {
  res.cookies.set(ID_PROOF_COOKIE, signIdProofUnlock({ adminId: admin.id, tokenVersion: admin.tokenVersion }, authSecret(), now), {
    ...cookieOptions,
    maxAge: Math.floor(ID_PROOF_UNLOCK_MS / 1000),
  });
  return now + ID_PROOF_UNLOCK_MS;
}

/** Locks them again at once (Lock now, and signing out). */
export function lockIdProofs(res: NextResponse): void {
  res.cookies.set(ID_PROOF_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}
