/**
 * The film's pictures, as shipped in public/free-china-trip/: twelve since
 * October, when Shanghai and Beijing came out of the city chapter.
 *
 * Each exists twice: the full file (1600px wide for most) and a phone copy
 * (`-960`), both WebP, made from the owner's PNGs (25 MB of PNG became 3.2 MB
 * full-size and 1.4 MB for phones). The <img> srcset picks by width, so a phone
 * never downloads the desktop file.
 *
 * `w`/`h` are the full file's pixels. They set each image's intrinsic ratio so
 * layout is reserved before the bytes arrive.
 *
 * 01–03 are flattened composites (silk, plane and tickets are baked in) and
 * are animated whole. 05–13 are clean cut-outs. 14, the host, is used in the
 * final call to action. 16, Afzal Khan, is the application page's host (made
 * 2026-09-28 from the owner's "Afzal Khan.png", cropped to the figure:
 * 1004 × 1390; the phone copy is 640 wide, named -960 like the others).
 */

const DIR = "/free-china-trip";

export interface FilmAsset {
  src: string;
  phone: string;
  w: number;
  h: number;
  /** Width of the phone copy, for srcset. */
  phoneW: number;
  /** In-between sizes, where one matters (the opening picture on a 2x phone). */
  more?: ReadonlyArray<{ src: string; w: number }>;
}

const asset = (file: string, w: number, h: number, phoneW = 960, more: number[] = []): FilmAsset => ({
  src: `${DIR}/${file}.webp`,
  phone: `${DIR}/${file}-960.webp`,
  w,
  h,
  phoneW,
  more: more.map((mw) => ({ src: `${DIR}/${file}-${mw}.webp`, w: mw })),
});

export const ASSETS = {
  // A 2x phone shows the opening picture about 1200px wide: without the
  // 1200 copy it would take the 1600 one (242 KB rather than 158 KB).
  traveler: asset("01-human-suitcase", 1600, 901, 960, [1200]),
  passport: asset("02-passport", 1600, 902),
  boardingPass: asset("03-boarding-pass", 1600, 903),
  airplane: asset("04-airplane", 1600, 900),
  globe: asset("05-globe", 1360, 1156, 900),
  chinaMap: asset("06-china-map", 1536, 1024),
  silk: asset("07-red-silk-ribbon", 1800, 605, 1100),
  gold: asset("08-gold-light-trail", 1800, 600, 1100),
  // 09-shanghai and 10-beijing are still in public/free-china-trip/ but no
  // longer used: the two cities came out of the film in October.
  guangzhou: asset("11-guangzhou", 1600, 800),
  // The arrival since October: Foshan's furniture market, made from the
  // owner's foshan-Market.png (1670 x 942) like the rest. 12-yiwu is still in
  // public/free-china-trip/ but no longer used.
  foshan: asset("12-foshan", 1600, 903),
  hotel: asset("13-hotel", 1600, 900),
  host: asset("14-host-presenter", 992, 1586, 640),
  afzalKhan: asset("16-afzal-khan", 1004, 1390, 640),
} as const;

export type AssetKey = keyof typeof ASSETS;

export const srcSetOf = (a: FilmAsset) =>
  [`${a.phone} ${a.phoneW}w`, ...(a.more ?? []).map((m) => `${m.src} ${m.w}w`), `${a.src} ${a.w}w`].join(", ");

/**
 * Points inside the pictures that the choreography aims at, as fractions of
 * the image. Read off the artwork, so they move if the artwork changes.
 */
export const ANCHORS = {
  /** Globe: southern India (near Chennai) and the bright hub over China. */
  globeIndia: { x: 0.35, y: 0.44 },
  globeChina: { x: 0.62, y: 0.31 },
  /** China map: the Guangzhou marker, which the camera dives into (the glow at
   *  the foot of the map's little Canton Tower, measured 0.570, 0.723). */
  mapGuangzhou: { x: 0.57, y: 0.723 },
} as const;
