import "server-only";
import type { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authSecret, authSecretOrNull } from "@/lib/secrets";
import type { SessionUser } from "@/lib/session-token";
import { VAULT_UNLOCK_MS, openPassword, readVaultUnlock, sealPassword, signVaultUnlock } from "@/lib/instagram-vault";

/**
 * The Instagram task's passwords on the server (lib/instagram-vault.ts is the cryptography): sealed with the server's
 * own secret, and read only by an administrator whose vault is open. The vault opens as ID proofs do: the admin types
 * their password again, and that opens passwords for ten minutes, for that admin only. The unlock is a cookie of its
 * own: httpOnly, same-site only, and sent to nothing but the vault's routes (its path), so no page or script ever
 * carries it, and an ID proof unlock never opens it.
 */
export const INSTAGRAM_VAULT_COOKIE = "affhan_ig_vault";
const COOKIE_PATH = "/api/admin/instagram-task/vault";

const cookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: COOKIE_PATH,
};

/** The admin's wrong passwords here, counted apart from their sign-in's and from the ID proof lock's. */
export const vaultLockKey = (adminId: string) => `igvault:${adminId}`;

/** When this admin's vault locks again, or null while it is locked (an unlock from before a password change too). */
export async function vaultOpenUntil(admin: SessionUser): Promise<number | null> {
  const store = await cookies();
  const claims = readVaultUnlock(store.get(INSTAGRAM_VAULT_COOKIE)?.value, authSecretOrNull());
  if (!claims) return null;
  if (claims.adminId !== admin.id || claims.tokenVersion !== admin.tokenVersion) return null;
  return claims.expiresAt;
}

/** Opens the vault for this admin, for VAULT_UNLOCK_MS from now. Returns when it locks again. */
export function openVault(res: NextResponse, admin: { id: string; tokenVersion: number }, now: number = Date.now()): number {
  res.cookies.set(INSTAGRAM_VAULT_COOKIE, signVaultUnlock({ adminId: admin.id, tokenVersion: admin.tokenVersion }, authSecret(), now), {
    ...cookieOptions,
    maxAge: Math.floor(VAULT_UNLOCK_MS / 1000),
  });
  return now + VAULT_UNLOCK_MS;
}

/** Locks it again at once. */
export function lockVault(res: NextResponse): void {
  res.cookies.set(INSTAGRAM_VAULT_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}

/** A password sealed for this account with the server's secret. */
export const sealAccountPassword = (plain: string, accountId: string) => sealPassword(plain, accountId, authSecret());

/** The password a sealed value holds for this account, or null when it can't be opened. */
export const openAccountPassword = (sealed: string, accountId: string) => openPassword(sealed, accountId, authSecretOrNull());
