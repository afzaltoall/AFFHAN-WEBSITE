// ---------------------------------------------------------------------------
// Cache tags for catalogue visibility.
//
// Every unstable_cache below is derived from the Category table, the Product
// table, or the moderation blocklist, and all of them ran on `revalidate: 3600`
// with a version-suffixed key. That combination has one bad property: a change
// made in the DATABASE does not invalidate anything. Only editing the key
// string does. So a category merge, a moderation block, or a product moving
// between categories stayed invisible for up to an hour — and up to 24h at the
// CDN, which serves these with stale-while-revalidate — unless someone
// remembered to hand-bump "categories-api-data-v9" to "-v10" and redeploy.
//
// That bump was done four times in two days, always after the fact and always
// as a separate step from the change that made it necessary. Tags replace it:
// the write calls revalidateCatalogue() and the caches drop immediately, with
// no deploy and no edit to a magic string.
//
// The version suffixes are gone from the keys as part of this. Keeping them
// would keep inviting the old habit, and they no longer do anything that the
// tags do not do better.
// ---------------------------------------------------------------------------

/// Anything derived from the Category table: the tree, the mega-menu, the
/// browse grid's tiles, per-category SEO metadata.
export const TAG_CATEGORIES = "catalogue:categories";

/// Anything derived from Product rows or counts — including the counts shown
/// on category tiles, which change when products are reassigned.
export const TAG_PRODUCTS = "catalogue:products";

/// What a change to the moderation blocklist affects. Blocking is applied over
/// both the category tree and product names, so it invalidates both; it has its
/// own name so the intent of a call site is readable.
export const CATALOGUE_TAGS = [TAG_CATEGORIES, TAG_PRODUCTS] as const;

// ---------------------------------------------------------------------------
// CDN caching for routes whose output depends on the moderation blocklist.
//
// revalidateTag purges the ORIGIN's data cache. It does not purge Vercel's edge
// cache for a route that sets its own Cache-Control header — that caching is
// manual and opaque to Next, so the edge keeps serving whatever it holds until
// the header says otherwise. Tag invalidation therefore fixes the origin in
// seconds and leaves the CDN untouched.
//
// That gap used to be measured in hours. /api/categories sent
// `s-maxage=3600, stale-while-revalidate=86400`, and stale-while-revalidate is
// the larger half of it: past the hour, the edge is still allowed to serve the
// stale copy for a further day while it refreshes in the background. Worst case
// ~25 hours. /api/products was ~24. For a catalogue where "hide this category"
// is a content-safety action — and it has been once already, when EPROLO's
// "Sex Product" categories went live — that is the wrong bound to accept.
//
// 60 seconds, and no stale-while-revalidate: past the minute the edge must
// revalidate before serving, so the worst case is the minute itself rather than
// the minute plus a day.
//
// The alternative was to drop the manual header and let Next cache the route,
// which on Vercel ties the edge entry to the tags and would purge both at once.
// It is the better architecture and it is the wrong thing to reach for first
// here: it cannot be verified from this environment, and its failure mode is an
// edge that never purges at all — unbounded, and silent. A short header is
// bounded whether or not anything else works, and the two can be combined later
// once the tag-to-edge behaviour has been confirmed on a real deployment.
//
// Cost: the origin is hit at most once a minute per edge region. The category
// tree is ~180KB of JSON off an in-process cache that still holds for an hour,
// so what actually repeats is the serialisation, not the query.
export const MODERATION_SENSITIVE_CACHE_CONTROL =
  "public, s-maxage=60, must-revalidate";
