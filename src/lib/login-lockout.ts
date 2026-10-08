/**
 * How long a password sign-in stays locked after failures (security audit
 * 2026-10-08, H5). Pure: lib/password.ts counts the failures in the database
 * and this says what they mean, so the rule can be tested on its own.
 *
 * Five failures lock the account for fifteen minutes. Once that is over, the
 * next five lock it for twice as long, and so on: 15 minutes, 30, 1 hour, 2,
 * 4, 8, 16, and a day at most. Failures older than a day are forgotten, and a
 * correct password clears them all.
 *
 * Counted per account, not per connection, so spreading the guesses over many
 * addresses does not buy more of them. The other side of that: anyone who
 * knows an address can keep its owner locked out by failing on purpose.
 * Turnstile on the console's sign-in is what makes that costly there.
 *
 * Kept free of path aliases and of other modules, so tests can load it as it is.
 */

export const LOCKOUT_EVERY = 5;
export const LOCKOUT_FIRST_MS = 15 * 60 * 1000;
export const LOCKOUT_LONGEST_MS = 24 * 60 * 60 * 1000;
/** Failures older than this no longer count. */
export const LOCKOUT_MEMORY_MS = 24 * 60 * 60 * 1000;

/**
 * When the lock lifts, or null when there is none. `failures` are the times
 * (epoch ms) of the failures still remembered, oldest first.
 *
 * The lock is timed from the failure that completed the latest five, so ten
 * guesses sent at once are locked for as long as ten sent one by one.
 */
export function lockedUntil(failures: readonly number[], now: number): number | null {
  const fives = Math.floor(failures.length / LOCKOUT_EVERY);
  if (fives === 0) return null;
  const lockedAt = failures[fives * LOCKOUT_EVERY - 1];
  const until = lockedAt + Math.min(LOCKOUT_FIRST_MS * 2 ** (fives - 1), LOCKOUT_LONGEST_MS);
  return until > now ? until : null;
}

/** How long a wait of `ms` is, in the words a sign-in form shows: "15 minutes", "1 hour". */
export function waitPhrase(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}
