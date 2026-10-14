import { unstable_cache } from "next/cache";
import { singleFlight } from "@/lib/singleFlight";

/**
 * unstable_cache, with one recompute at a time per key (lib/singleFlight.ts).
 *
 * The same arguments and options as unstable_cache. On a miss, or once an entry
 * is stale, the requests that arrive together in one process share a single
 * run of `fn` rather than each running it.
 */
export function cachedOnce<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  keyParts: string[],
  options: { revalidate?: number | false; tags?: string[] },
): (...args: A) => Promise<R> {
  const once = (...args: A) => singleFlight(JSON.stringify([keyParts, args]), () => fn(...args));
  return unstable_cache(once, keyParts, options);
}
