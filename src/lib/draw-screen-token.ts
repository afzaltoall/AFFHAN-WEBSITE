import crypto from "crypto";

// ---------------------------------------------------------------------------
// The lucky draw's TV screen pass (2026-11-10, the owner: "we will put the lucky draw page on the TV ... it must not
// get stuck"). The console's own session ends after thirty minutes without a click, and two minutes before that it
// puts a countdown on the screen: on a TV, between two draws, that is the screen getting stuck in front of everyone. So
// the screen runs on a pass of its own, which an admin's session gives it: good for DRAW_SCREEN_MS, for one mode (live or
// rehearsal), and able to do two things only, read the board without anyone's mobile number and press Draw. This is the
// cryptography alone, with no database and no path aliases, so a test can load it as it is
// (tests/security/lucky-draw.test.mjs); lib/server/draw-screen.ts adds the cookie, the secret and the admin's check.
//
// Keyed with a key DERIVED from AUTH_SECRET, never AUTH_SECRET itself (which the admin and staff cookies use), so a
// session can never pass for a screen pass, nor a pass for a session. It names the admin and the tokenVersion of their
// account, so a password change or "sign out everywhere" ends it as well, and it carries its own end.
// ---------------------------------------------------------------------------

/** How long a screen pass lasts: an evening's event, with room either side. */
export const DRAW_SCREEN_MS = 12 * 60 * 60 * 1000;

/** What the key is derived with. Changing it ends every pass at once. */
const KEY_LABEL = "affhan lucky draw screen v1";

export type DrawScreenMode = "live" | "rehearsal";

export interface DrawScreenClaims {
  /** AdminUser.id of the admin who opened the screen. */
  adminId: string;
  /** AdminUser.tokenVersion when it was opened. */
  tokenVersion: number;
  /** The one mode this screen draws in. */
  mode: DrawScreenMode;
}

function screenKey(authSecret: string): Buffer {
  return crypto.createHmac("sha256", authSecret).update(KEY_LABEL).digest();
}

function sign(payload: string, authSecret: string): string {
  return crypto.createHmac("sha256", screenKey(authSecret)).update(payload).digest("base64url");
}

/** A pass for this admin's screen, in this mode, from now until DRAW_SCREEN_MS from now. */
export function signDrawScreen(claims: DrawScreenClaims, authSecret: string, now: number = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ kind: "draw-screen", sub: claims.adminId, v: claims.tokenVersion, mode: claims.mode, exp: now + DRAW_SCREEN_MS }),
  ).toString("base64url");
  return `${payload}.${sign(payload, authSecret)}`;
}

/**
 * The admin, account version and mode a pass names, and when it ends, or null when it is not a live one of ours: a
 * forged or altered signature, another kind of token, one past its end, or one claiming to last longer than any we
 * sign. No secret means no pass is trusted. Whether the admin still exists, on this version, is the caller's check.
 */
export function readDrawScreen(
  token: string | null | undefined,
  authSecret: string | null,
  now: number = Date.now(),
): (DrawScreenClaims & { expiresAt: number }) | null {
  if (!token || !authSecret) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = Buffer.from(sign(parts[0], authSecret));
  const given = Buffer.from(parts[1]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(parts[0], "base64url").toString());
  } catch {
    return null;
  }
  const d = data as { kind?: unknown; sub?: unknown; v?: unknown; mode?: unknown; exp?: unknown };
  if (d.kind !== "draw-screen" || typeof d.sub !== "string" || !d.sub || typeof d.v !== "number" || typeof d.exp !== "number") return null;
  if (d.mode !== "live" && d.mode !== "rehearsal") return null;
  if (d.exp <= now || d.exp > now + DRAW_SCREEN_MS) return null;
  return { adminId: d.sub, tokenVersion: d.v, mode: d.mode, expiresAt: d.exp };
}
