/**
 * The film's fourteen pictures, as shipped in public/free-china-trip/.
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
 * final call to action and nowhere else.
 */

const DIR = "/free-china-trip";

export interface FilmAsset {
  src: string;
  phone: string;
  w: number;
  h: number;
  /** Width of the phone copy, for srcset. */
  phoneW: number;
}

const asset = (file: string, w: number, h: number, phoneW = 960): FilmAsset => ({
  src: `${DIR}/${file}.webp`,
  phone: `${DIR}/${file}-960.webp`,
  w,
  h,
  phoneW,
});

export const ASSETS = {
  traveler: asset("01-human-suitcase", 1600, 901),
  passport: asset("02-passport", 1600, 902),
  boardingPass: asset("03-boarding-pass", 1600, 903),
  airplane: asset("04-airplane", 1600, 900),
  globe: asset("05-globe", 1360, 1156, 900),
  chinaMap: asset("06-china-map", 1536, 1024),
  silk: asset("07-red-silk-ribbon", 1800, 605, 1100),
  gold: asset("08-gold-light-trail", 1800, 600, 1100),
  shanghai: asset("09-shanghai", 1600, 900),
  beijing: asset("10-beijing", 1600, 800),
  guangzhou: asset("11-guangzhou", 1600, 800),
  yiwu: asset("12-yiwu", 1600, 800),
  hotel: asset("13-hotel", 1600, 900),
  host: asset("14-host-presenter", 1024, 1536, 640),
} as const;

export type AssetKey = keyof typeof ASSETS;

export const srcSetOf = (a: FilmAsset) => `${a.phone} ${a.phoneW}w, ${a.src} ${a.w}w`;

/**
 * Points inside the pictures that the choreography aims at, as fractions of
 * the image. Read off the artwork, so they move if the artwork changes.
 */
export const ANCHORS = {
  /** Globe: southern India (near Chennai) and the bright hub over China. */
  globeIndia: { x: 0.35, y: 0.44 },
  globeChina: { x: 0.62, y: 0.31 },
  /** China map: the Shanghai marker, which the camera dives into. */
  mapShanghai: { x: 0.8, y: 0.5 },
} as const;
