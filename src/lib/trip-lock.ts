import { prisma } from "@/lib/prisma";

/**
 * The lock on the homepage's Free China Business Trip banner (the owner's
 * request of 2026-10-05). While it is locked the banner sits behind frosted
 * glass with a lock on it (TripLockOverlay), and neither the banner nor the
 * button under it opens anything. An admin unlocks it from the console's Free
 * China Trip page, and everyone on the homepage at that moment watches it
 * open (the banner asks /api/trip-lock/ every few seconds while it is
 * locked); an admin can lock it again from there.
 *
 * It locks the banner, not the trip: /free-china-trip/ and its application
 * still open from a link someone already has.
 *
 * It fails shut. No row, or a database that cannot be read, reads as locked,
 * so a fault never opens it.
 */

const ID = "trip-banner";

/** The banner polls; the row is read at most once every few seconds per server instance. */
const FRESH_MS = 3000;

export interface TripLockState {
  locked: boolean;
  /** When it was unlocked (ISO); null while it is locked. */
  unlockedAt: string | null;
  /** The admin who last unlocked or locked it, and when; null if nobody has yet. */
  changedBy: string | null;
  changedAt: string | null;
}

const SHUT: TripLockState = { locked: true, unlockedAt: null, changedBy: null, changedAt: null };

let cached: { at: number; state: TripLockState } | null = null;
/** The last read failure logged: the banner asks every few seconds, and one line per failure is enough. */
let reported = "";

async function read(): Promise<TripLockState> {
  // A Prisma client generated before this table was added has no tripLock at
  // all (a dev server started before it, on Windows, cannot regenerate while
  // it runs: CLAUDE.md).
  if (!prisma.tripLock) {
    throw new Error("this Prisma client has no TripLock model: stop the dev server, run `npx prisma generate`, start it again");
  }
  const row = await prisma.tripLock.findUnique({ where: { id: ID } });
  if (!row) return SHUT;
  return {
    locked: !row.unlockedAt,
    unlockedAt: row.unlockedAt ? row.unlockedAt.toISOString() : null,
    changedBy: row.changedBy,
    changedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The lock as it stands. `fresh` skips the few-second memo, for the console.
 * Never throws: a read that fails is logged and comes back locked, with
 * `failed` set so the console can say it could not tell.
 */
export async function tripLock({ fresh = false } = {}): Promise<TripLockState & { failed?: true }> {
  if (!fresh && cached && Date.now() - cached.at < FRESH_MS) return cached.state;
  try {
    const state = await read();
    cached = { at: Date.now(), state };
    reported = "";
    return state;
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    if (why !== reported) {
      reported = why;
      console.error(`trip lock read failed, so the banner stays locked: ${why}`);
    }
    return { ...SHUT, failed: true };
  }
}

/**
 * The console's two actions, as `by` (the admin's sign-in email). Asking for
 * what is already so changes nothing, so a second press, or a second admin,
 * cannot move the time it was unlocked. Returns the lock as it now stands.
 */
export async function setTripLock(action: "unlock" | "lock", by: string): Promise<TripLockState> {
  const now = await read();
  if (now.locked === (action === "lock")) return now;
  const unlockedAt = action === "unlock" ? new Date() : null;
  await prisma.tripLock.upsert({
    where: { id: ID },
    create: { id: ID, unlockedAt, changedBy: by },
    update: { unlockedAt, changedBy: by },
  });
  cached = null;
  return read();
}
