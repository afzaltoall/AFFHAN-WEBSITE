/**
 * One run at a time per key, inside this server process (2026-10-14).
 *
 * When a cached answer expires, every request that arrives before the first
 * one has recomputed it would otherwise recompute it too: a stampede, each
 * holding a database connection for the length of the query. With this, the
 * first caller runs `fn` and every caller that arrives while it runs is handed
 * the same promise, settled or failed together. Nothing is kept afterwards:
 * keeping answers is the cache's job, this only stops them being made twice.
 *
 * Per process, by design. Across instances the work that is expensive does not
 * run on a request at all (lib/snapshots.ts precomputes it under a lock); what
 * still runs on one is a single indexed read per key.
 *
 * Free of path aliases and other modules, so it is tested on its own
 * (tests/perf/single-flight.test.mjs).
 */
const running = new Map<string, Promise<unknown>>();

export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const current = running.get(key);
  if (current) return current as Promise<T>;
  const run = (async () => fn())().finally(() => running.delete(key));
  running.set(key, run);
  return run;
}

/** How many keys are running now: for tests. */
export function inFlightCount(): number {
  return running.size;
}
