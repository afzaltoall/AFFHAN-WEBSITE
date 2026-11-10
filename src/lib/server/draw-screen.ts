import "server-only";
import type { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { authSecret, authSecretOrNull } from "@/lib/secrets";
import { getCurrentUser } from "@/lib/session";
import { DRAW_SCREEN_MS, readDrawScreen, signDrawScreen, type DrawScreenMode } from "@/lib/draw-screen-token";

/**
 * The lucky draw's TV screen pass (lib/draw-screen-token.ts says why and how it is made): a cookie of its own for each
 * mode, httpOnly, same-site only, and sent to nothing but the lucky draw's routes (its path), so no other page or
 * script ever carries it. It reads the board as the screen may show it and presses Draw, in its own mode, and nothing
 * else: releasing someone, clearing a rehearsal and opening another screen need the admin's own session.
 */
const COOKIE_PATH = "/api/admin/lucky-draw";
export const drawScreenCookie = (mode: DrawScreenMode) => `affhan_draw_${mode}`;

const cookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: COOKIE_PATH,
};

export type DrawActor =
  | { kind: "admin"; adminId: string; name: string }
  | { kind: "screen"; adminId: string; name: string; mode: DrawScreenMode };

/** The admin signed in to the console, as getCurrentUser reads them (inside the session's idle window), or null. */
export async function consoleAdmin(): Promise<{ id: string; name: string } | null> {
  const admin = await getCurrentUser();
  return admin && admin.role === "admin" ? { id: admin.id, name: admin.name || admin.email } : null;
}

/**
 * Who is asking, for `mode`: the admin's own session first, then the screen's pass for that mode, which counts only
 * while the admin who opened it still exists on the same account version (a password change or "sign out everywhere"
 * ends every screen they opened). Null for anyone else.
 */
export async function drawActor(mode: DrawScreenMode): Promise<DrawActor | null> {
  const admin = await consoleAdmin();
  if (admin) return { kind: "admin", adminId: admin.id, name: admin.name };
  const store = await cookies();
  const claims = readDrawScreen(store.get(drawScreenCookie(mode))?.value, authSecretOrNull());
  if (!claims || claims.mode !== mode) return null;
  const row = await prisma.adminUser.findUnique({ where: { id: claims.adminId }, select: { tokenVersion: true, name: true, email: true } });
  if (!row || row.tokenVersion !== claims.tokenVersion) return null;
  return { kind: "screen", adminId: claims.adminId, name: row.name || row.email, mode };
}

/** Gives this browser a screen pass for `mode`, from the admin's account as it stands now. False when there is no
 *  such admin. */
export async function openDrawScreen(res: NextResponse, adminId: string, mode: DrawScreenMode, now: number = Date.now()): Promise<boolean> {
  const row = await prisma.adminUser.findUnique({ where: { id: adminId }, select: { tokenVersion: true } });
  if (!row) return false;
  res.cookies.set(drawScreenCookie(mode), signDrawScreen({ adminId, tokenVersion: row.tokenVersion, mode }, authSecret(), now), {
    ...cookieOptions,
    maxAge: Math.floor(DRAW_SCREEN_MS / 1000),
  });
  return true;
}
