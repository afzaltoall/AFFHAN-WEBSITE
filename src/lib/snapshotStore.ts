import { Prisma } from ".prisma/client";
import { prisma } from "@/lib/prisma";
import { cachedOnce } from "@/lib/cachedOnce";
import { TAG_SNAPSHOTS } from "@/lib/cacheTags";

// ---------------------------------------------------------------------------
// The Snapshot table: answers the daily refresh (lib/snapshots.ts) computes so
// that no visitor's request does (2026-10-14). The homepage's draws used to be
// built on a request whenever their hour's cache ran out, by queries that took
// seconds each, and every instance that missed at the same moment built them
// again. Now a request reads one row by key, and nothing here ever computes.
//
// A row per kind and key ("home-grid:2026-W42"). The value is wrapped
// ({ v: ... }), so an answer that is null (no spotlight today) is stored like
// any other.
// ---------------------------------------------------------------------------

export type SnapshotKind =
  | "home-grid"
  | "home-spotlight"
  | "home-rails"
  | "home-trades"
  | "home-more"
  | "hero-pool"
  | "catalogue-total";

const rowKey = (kind: string, key: string) => `${kind}:${key}`;

const readRow = cachedOnce(
  async (kind: SnapshotKind, key: string): Promise<{ key: string; value: unknown } | null> => {
    const exact = await prisma.snapshot.findUnique({ where: { key: rowKey(kind, key) }, select: { key: true, value: true } });
    if (exact) return exact;
    // A refresh that has not run yet for this key (the day turned before it, or
    // it failed): the newest of the kind, an older draw rather than none.
    const newest = await prisma.snapshot.findFirst({ where: { kind }, orderBy: { computedAt: "desc" }, select: { key: true, value: true } });
    if (newest) console.warn(`[snapshots] no ${rowKey(kind, key)} yet; showing ${newest.key}`);
    else console.warn(`[snapshots] no ${kind} at all: has the refresh run? (/api/cron/refresh)`);
    return newest;
  },
  ["snapshot"],
  { revalidate: 3600, tags: [TAG_SNAPSHOTS] },
);

/** A precomputed answer: the key's own, else the newest of its kind, else null. Never computed here. */
export async function readSnapshot<T>(kind: SnapshotKind, key: string): Promise<T | null> {
  const row = await readRow(kind, key);
  if (!row || typeof row.value !== "object" || row.value === null || !("v" in row.value)) return null;
  return (row.value as { v: T }).v;
}

/**
 * The same, read from the database directly: for use INSIDE another cached
 * function. One unstable_cache called within another and also on its own in
 * the same render can hand the outer call `undefined` while a stale entry is
 * being regenerated (Next keeps the inner write's promise where the stale path
 * expects the value), which broke a /rankings prerender on 2026-10-14. Nothing
 * here nests one cache in another.
 */
export async function readSnapshotNow<T>(kind: SnapshotKind, key: string): Promise<T | null> {
  const row = await prisma.snapshot.findUnique({ where: { key: rowKey(kind, key) }, select: { value: true } });
  if (!row || typeof row.value !== "object" || row.value === null || !("v" in row.value)) return null;
  return (row.value as { v: T }).v;
}

/** Store an answer for the refresh: the value must be plain JSON (strings, numbers, arrays, objects, null). */
export async function writeSnapshot(kind: SnapshotKind, key: string, value: unknown): Promise<void> {
  const k = rowKey(kind, key);
  const v = { v: value } as Prisma.InputJsonObject;
  const computedAt = new Date();
  await prisma.snapshot.upsert({
    where: { key: k },
    create: { key: k, kind, value: v, computedAt },
    update: { value: v, computedAt },
  });
}

/** Which of these keys of a kind have an answer stored: for the refresh's "is today's done" check. */
export async function storedKeys(kind: SnapshotKind, keys: string[]): Promise<Set<string>> {
  const rows = await prisma.snapshot.findMany({ where: { key: { in: keys.map((k) => rowKey(kind, k)) } }, select: { key: true } });
  return new Set(rows.map((r) => r.key.slice(kind.length + 1)));
}

/** Drop the draws older than `days`: the table holds a fortnight, not a history. */
export async function pruneSnapshots(days: number): Promise<number> {
  const { count } = await prisma.snapshot.deleteMany({
    where: { kind: { notIn: ["meta", "lock"] }, computedAt: { lt: new Date(Date.now() - days * 86_400_000) } },
  });
  return count;
}

// The refresh's own records, read and written directly (never cached): what it
// last did and how far a re-flag has got.

export async function readMeta<T>(name: string): Promise<T | null> {
  const row = await prisma.snapshot.findUnique({ where: { key: rowKey("meta", name) }, select: { value: true } });
  return row && typeof row.value === "object" && row.value !== null && "v" in row.value ? (row.value as { v: T }).v : null;
}

export async function writeMeta(name: string, value: unknown): Promise<void> {
  const k = rowKey("meta", name);
  const v = { v: value } as Prisma.InputJsonObject;
  const computedAt = new Date();
  await prisma.snapshot.upsert({ where: { key: k }, create: { key: k, kind: "meta", value: v, computedAt }, update: { value: v, computedAt } });
}

// One refresh at a time, across every instance: a row whose lockedUntil is in
// the future. One statement takes it (inserted, or taken over once expired), so
// it holds through Neon's pooler, where a session-level advisory lock would not:
// PgBouncer in transaction mode hands the next statement to another connection.

const LOCK = rowKey("lock", "refresh");

/** Take the refresh lock for `ttlMs`; false if another run holds it. */
export async function takeRefreshLock(ttlMs: number): Promise<boolean> {
  const until = new Date(Date.now() + ttlMs);
  const rows = await prisma.$queryRaw<{ key: string }[]>(Prisma.sql`
    INSERT INTO "Snapshot" ("key", "kind", "value", "computedAt", "lockedUntil")
    VALUES (${LOCK}, 'lock', '{}'::jsonb, now(), ${until})
    ON CONFLICT ("key") DO UPDATE SET "lockedUntil" = EXCLUDED."lockedUntil", "computedAt" = now()
      WHERE "Snapshot"."lockedUntil" IS NULL OR "Snapshot"."lockedUntil" < now()
    RETURNING "key"`);
  return rows.length > 0;
}

export async function releaseRefreshLock(): Promise<void> {
  await prisma.snapshot.updateMany({ where: { key: LOCK }, data: { lockedUntil: null } });
}
