// The /shipping/ hero's mark: the square emblem, trimmed to its artwork.
//
// Cut by scripts/build_ship_assets.mjs, which lives with the emblem work
// (commit f171a24) rather than here: that script also rewrites the homepage's
// "Affhan Shipping" pill image, and the homepage keeps its own mark until
// that is decided on its own. Width and height are the file's real
// dimensions, so next/image reserves exactly the space it fills.

export const SHIP_MARK_HERO = { src: "/affhan-ship-hero.webp", width: 480, height: 477 } as const;
