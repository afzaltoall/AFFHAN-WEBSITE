// How the homepage's product pool is divided between its three sections.
//
// Deliberately free of any server import: src/lib/products.ts pulls in Prisma,
// and these values are read by client components.
//
// Rotation is the server's job. getHeroFeed() shuffles a 600-row cached pool
// on every call and src/app/page.tsx sets `revalidate = 3600`, so each ISR
// regeneration bakes a fresh set into the cached HTML and everyone inside that
// hour sees the same products.
//
// The sections used to re-shuffle again after hydration so that every refresh
// varied. That needed the server to ship 400 products to render 90, and the
// 310 spares were parsed and hydrated only to be discarded — see the note on
// splitHeroPool.
//
// And why the sections once repeated each other: they carved the SAME array by
// hard-coded index — hero took 0..60, Popular 61..81, Spotlight 60..65. The
// last two overlap the first, so a product could appear twice on one screen.
// splitHeroPool replaces that with ranges that cannot overlap by construction.

export type PoolItem = { id: number };

/// How many items each section finally renders.
export const HERO_GRID_COUNT = 65;      // 5 beside the sidebar + 10 rows of 6

/// Kept as a record of something that was tried and did not work.
///
/// The theory was sound: LCP is whichever above-the-fold image is largest, the
/// shuffle replaces it, so freezing the leading cards should stop the browser
/// fetching one image and then another. Measured on production over 5-run
/// samples it made no difference that could be told apart from noise —
/// 3.61-6.41s with it, 3.24-4.97s without. Same for marking five images
/// priority instead of one: 3.81-4.25s, also inside the variance.
///
/// The homepage LCP under 4x CPU + Slow 4G is roughly 3-5s and dominated by
/// run-to-run variance, not by which product image is chosen. Whatever gets it
/// under 2.5s is not here.
export const LCP_STABLE_LEAD = 5;
export const POPULAR_COUNT = 20;
export const SPOTLIGHT_COUNT = 5;

/// How many products the homepage actually renders, across all three sections.
export const HOMEPAGE_PRODUCT_COUNT = HERO_GRID_COUNT + POPULAR_COUNT + SPOTLIGHT_COUNT;

/// Each section gets exactly the slice it renders.
///
/// This used to hand out far more than that — 240 to the hero, 100 to the
/// carousel, the rest to the spotlight — so each section could reshuffle after
/// hydration and look different on every refresh. The headroom was the whole
/// point: picking 65 out of 240 varies, picking 65 out of 65 does not.
///
/// It was also most of the page's weight. The server shipped 400 products to
/// render 90: ~174KB of RSC payload, 310 of which were serialised, downloaded,
/// parsed and hydrated so that a client-side shuffle could throw them away.
///
/// Rotation now happens on the server instead. getHeroFeed() already shuffles
/// its cached pool on every call, and the page is ISR with revalidate = 3600,
/// so each regeneration picks a fresh 90 out of the full pool and everyone
/// inside that hour sees the same ones. Variety per hour rather than per
/// refresh, which is how large catalogue homepages generally do it, and
/// nothing leaves the server that is not drawn.
///
/// To rotate faster, lower `revalidate` in src/app/page.tsx — that is the only
/// knob now, and it costs origin renders rather than payload.
export function splitHeroPool<T extends PoolItem>(pool: readonly T[]) {
  const withImage = pool.filter((p) => (p as { imageUrl?: string | null }).imageUrl);
  const popularEnd = HERO_GRID_COUNT + POPULAR_COUNT;
  return {
    hero: withImage.slice(0, HERO_GRID_COUNT),
    popular: withImage.slice(HERO_GRID_COUNT, popularEnd),
    spotlight: withImage.slice(popularEnd, popularEnd + SPOTLIGHT_COUNT),
  };
}
