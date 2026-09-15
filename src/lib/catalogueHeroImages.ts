/**
 * The four cards in the /products/ opening hero.
 *
 * Shared, because two places need the exact same strings: the hero renders
 * them, and the page preloads them. A preload only counts if its URL matches
 * the one the <img> requests, so the two cannot be allowed to drift — and the
 * directory name contains a space, which is the sort of thing that survives a
 * copy-paste right up until it does not.
 *
 * Percent-encoded here rather than relying on the browser to normalise a
 * literal space inside a `href`, so the preload and the request are byte-identical.
 *
 * WebP, not the PNGs these replaced. The originals were 8-bit truecolour+ALPHA
 * PNGs — 1,935 KB for four flat-colour graphics, and the alpha channel was
 * fully opaque in all four, so it was pure weight. At q90 the same four are
 * 49 KB: a 97% saving, max channel difference 12-16/255 against the PNG with
 * a mean under half a level, and no visible ringing on the glyph edges at 3x.
 * The PNGs are kept in the repo as the editable source.
 */
export const CATALOGUE_HERO_IMAGES = [
  "/full%20catalogue/discover.webp",
  "/full%20catalogue/verify.webp",
  "/full%20catalogue/customize.webp",
  "/full%20catalogue/Deliver.webp",
] as const;

/**
 * Intrinsic size of all four, for the width/height attributes.
 *
 * They are 1375x768 and 1376x768 — a one-pixel difference that nothing can
 * see, and CSS sizes the card anyway (w-[36vw] h-[24vh], object-cover). These
 * attributes exist to give the box an aspect ratio before the bytes arrive,
 * not to set the layout.
 */
export const CATALOGUE_HERO_SIZE = { width: 1376, height: 768 } as const;
