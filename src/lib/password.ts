import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// The rule itself lives in lib/password-rules.ts, which imports nothing, so
// the forms can check as you type without dragging bcrypt and Prisma into the
// browser. Re-exported here so server code has one import to reach for.
export {
  checkPasswordStrength,
  PASSWORD_MIN,
  PASSWORD_MAX,
} from "@/lib/password-rules";

// ---------------------------------------------------------------------------
// Customer passwords: one rule, one cost, one place.
//
// Written once because the same password is set from four directions now — the
// sign-up step, the reset flow, the account page, and the app's own register
// route — and four copies of "at least eight characters" drift within a month.
//
// Twelve rounds, matching /api/mobile/auth/register. The website and the app
// verify each other's hashes: the same person signs in on their phone with the
// password they chose on the site, so this is not a number to pick freely.
// ---------------------------------------------------------------------------

const BCRYPT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ---------------------------------------------------------------------------
// Throttling failed sign-ins, per address.
// ---------------------------------------------------------------------------

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** How many failures this address has collected inside the window. */
export async function countRecentLoginFailures(email: string): Promise<number> {
  return prisma.loginAttempt.count({
    where: {
      email: email.trim().toLowerCase(),
      createdAt: { gte: new Date(Date.now() - LOGIN_WINDOW_MS) },
    },
  });
}

export async function recordLoginFailure(email: string): Promise<void> {
  await prisma.loginAttempt
    .create({ data: { email: email.trim().toLowerCase() } })
    .catch(() => {
      // A missed count is better than a failed sign-in attempt turning into a
      // 500 for someone who simply mistyped.
    });
}

/** Wipe the slate after a successful sign-in. */
export async function clearLoginFailures(email: string): Promise<void> {
  await prisma.loginAttempt
    .deleteMany({ where: { email: email.trim().toLowerCase() } })
    .catch(() => {});
}
