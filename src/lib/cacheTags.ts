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
