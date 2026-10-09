import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { LOCKOUT_MEMORY_MS, lockedUntil } from "@/lib/login-lockout";

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

/**
 * A twelve-round bcrypt hash of 32 random bytes that were thrown away, so no
 * password matches it. Compared against when there is no account or no
 * password on it, so that answer costs the same bcrypt work as a wrong
 * password, and the response time does not tell the two apart.
 */
const NO_ACCOUNT_HASH = "$2a$12$Pku6Pu.yWEcrFNv0wBvsmuyhevfvUdUxhzhNbW5IUbnQtyNVzfjH.";

/** verifyPassword that takes as long when there is no hash to check against. */
export async function verifyPasswordOrNothing(
  password: string,
  hash: string | null | undefined
): Promise<boolean> {
  const matches = await bcrypt.compare(password, hash || NO_ACCOUNT_HASH);
  return Boolean(hash) && matches;
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

/**
 * How long this address stays locked under the window above, or null when it
 * is not. The lock lifts when the failure that made the count five leaves the
 * window. For the staff sign-in, which says how long to wait.
 */
export async function windowLockRemainingMs(email: string): Promise<number | null> {
  const now = Date.now();
  const rows = await prisma.loginAttempt.findMany({
    where: { email: email.trim().toLowerCase(), createdAt: { gte: new Date(now - LOGIN_WINDOW_MS) } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  if (rows.length < LOGIN_MAX_FAILURES) return null;
  const until = rows[rows.length - LOGIN_MAX_FAILURES].createdAt.getTime() + LOGIN_WINDOW_MS;
  return Math.max(until - now, 1_000);
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

// ---------------------------------------------------------------------------
// The lockout with a growing wait, for the console's sign-in and the
// customers' (security audit 2026-10-08, H5; the rule is lib/login-lockout.ts).
// Staff sign-in keeps the fifteen-minute window above.
//
// Kept in LoginAttempt under a prefix per door, so the console's admin and a
// customer with the same address are never locked, or unlocked, by each
// other. The website and the app share the customer key: they sign in the
// same accounts, and two separate counts would be two sets of guesses.
// ---------------------------------------------------------------------------

export const adminLoginKey = (email: string) => `admin:${email.trim().toLowerCase()}`;
export const customerLoginKey = (email: string) => `customer:${email.trim().toLowerCase()}`;

export type LoginAttemptGate = { locked: false } | { locked: true; retryAfterMs: number };

/**
 * Open a password attempt for `key`, or say how long it is locked for.
 *
 * The attempt is written down before the password is checked and stands as a
 * failure until clearLoginFailures runs after a correct one. Counting after
 * the check would let a burst of simultaneous guesses all pass the count
 * before any of them was recorded; this way they see one another. A refused
 * attempt is not a guess and is struck off again, or anyone could keep the
 * lock going forever.
 */
export async function beginLoginAttempt(key: string): Promise<LoginAttemptGate> {
  const now = Date.now();
  const attempt = await prisma.loginAttempt.create({ data: { email: key }, select: { id: true } });
  const earlier = await prisma.loginAttempt.findMany({
    where: {
      email: key,
      id: { not: attempt.id },
      createdAt: { gte: new Date(now - LOCKOUT_MEMORY_MS) },
    },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
    take: 1000,
  });
  const until = lockedUntil(earlier.map((row) => row.createdAt.getTime()), now);
  if (until === null) return { locked: false };
  await prisma.loginAttempt.delete({ where: { id: attempt.id } }).catch(() => {});
  return { locked: true, retryAfterMs: until - now };
}
