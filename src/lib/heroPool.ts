// Splitting and shuffling for the homepage product pool.
//
// Deliberately free of any server import. src/lib/products.ts pulls in Prisma,
// so a client component cannot borrow its shuffle(); these are pure functions
// the sections can run after hydration.
//
// Why the homepage showed the same products on every refresh: getHeroFeed()
// already randomises (shuffle(...).slice(0, limit)), but src/app/page.tsx sets
// `revalidate = 3600`, so that shuffle ran once an hour and the result was
// baked into cached HTML. Every visitor inside the hour got byte-identical
// products. Re-shuffling on the client after hydration restores per-visit
// variety without giving up the cached page.
//
// And why the sections repeated each other: they carved the SAME array by
// hard-coded index — hero took 0..60, Popular 61..81, Spotlight 60..65. The
// last two overlap the first, so a product could appear twice on one screen.
// splitHeroPool replaces that with ranges that cannot overlap by construction.

export type PoolItem = { id: number };

/// Fisher-Yates, on a copy. Never mutates the caller's array — the sections
/// hold theirs in state and React must not see it change in place.
export function shuffleArray<T>(input: readonly T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/// How many items each section finally renders.
export const HERO_GRID_COUNT = 65;      // 5 beside the sidebar + 10 rows of 6

/// The first few hero cards are NOT shuffled.
///
/// LCP is whichever above-the-fold image is largest, and the shuffle used to
/// replace it: the browser fetched the server's image, then the effect swapped
/// the src and it had to fetch and paint another one, so LCP was re-measured
/// later. Samples ranged 2.39-3.48s against Google's 2.5s threshold.
///
/// Freezing the leading cards means the image the server rendered — and marked
/// priority, so it is preloaded — is the one that stays. The other 60 still
/// rotate, which is where the variety was always visible anyway.
export const LCP_STABLE_LEAD = 5;
export const POPULAR_COUNT = 20;
export const SPOTLIGHT_COUNT = 5;

/// Each section gets its own slice of the pool, several times larger than what
/// it renders. The headroom is what makes a refresh look different: picking 65
/// out of 240 varies far more than picking 65 out of 70.
export function splitHeroPool<T extends PoolItem>(pool: readonly T[]) {
  const withImage = pool.filter((p) => (p as { imageUrl?: string | null }).imageUrl);
  const heroEnd = Math.min(240, withImage.length);
  const popularEnd = Math.min(heroEnd + 100, withImage.length);
  return {
    hero: withImage.slice(0, heroEnd),
    popular: withImage.slice(heroEnd, popularEnd),
    spotlight: withImage.slice(popularEnd),
  };
}
