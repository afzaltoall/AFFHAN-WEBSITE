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
  // The owner's market map since 2026-10-05 (Guangzhou, Foshan and six
  // markets), built with its light's field by scripts/build_trip_map.mjs.
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

/**
 * The little plane printed on the boarding pass's route, lifted off the paper
 * so the film can fly it (Scene03). Cut from the 1600 x 903 picture at this
 * box and un-blended from the paper (#f3f0ed) with its alpha kept, so drawn
 * at the box over a patch of paper it reproduces its own print (a mean
 * difference of 2 levels in 255). 1.8 KB. Remake it if the artwork changes.
 * `paper` is the patch's colour: between the two copies' paper around the
 * box (#f3f0ec full size, #f1efeb for phones). `body` is its fuselage, read
 * off the cut-out: the middle (in the box) and the length, tail to nose; the
 * airliner is born to that size where it takes off (animations.ts).
 */
export const PASS_PLANE = {
  src: `${DIR}/03-boarding-pass-plane.webp`,
  x: 547,
  y: 411,
  w: 62,
  h: 50,
  paper: "#f2efeb",
  body: { x: 31, y: 22, length: 52 },
} as const;

/**
 * The plane's working parts, read off 04-airplane (1600 x 900), so the
 * flight can bring them to life (Scene04). Each engine faces the camera at an
 * angle, so its fan face is an ellipse: fitted to the dark disc inside the
 * intake lip by its moments (centre, long and short semi-axes, the long
 * axis's angle from horizontal), with the spinner's tip, which sits off that
 * centre because it stands proud of the fan. The navigation lights are on
 * the wingtips where the leading edge meets the winglet: red on the near
 * wing, the plane's left, and green on the far one, as on every aircraft.
 * The red beacon is the bright spot the artwork has under the belly. The
 * axis is the fuselage's centre line, tail cone to the tip of the nose: the
 * take-off matches it to the printed plane's (animations.ts).
 * Remeasure if the artwork changes.
 */
export const PLANE_PARTS = {
  fans: [
    { cx: 876, cy: 460.6, a: 63, b: 53.1, deg: 79.1, hub: [858, 471] },
    { cx: 1389.1, cy: 550.6, a: 63.4, b: 51.8, deg: 77.9, hub: [1372, 561] },
  ],
  navPort: [86, 371],
  navStarboard: [1544, 611],
  beacon: [1055, 526],
  axis: { tail: [450, 600], nose: [1575, 180] },
} as const;

export const srcSetOf = (a: FilmAsset) =>
  [`${a.phone} ${a.phoneW}w`, ...(a.more ?? []).map((m) => `${m.src} ${m.w}w`), `${a.src} ${a.w}w`].join(", ");

/**
 * Points inside the pictures that the choreography aims at, as fractions of
 * the image. Read off the artwork, so they move if the artwork changes.
 */
export const ANCHORS = {
  /** Boarding pass: its printed route from IND to CHN. The dashes start after
   *  IND, the little plane is printed on them halfway (its centre), and they
   *  end at a dot just before CHN, climbing 12.8° with the ticket. */
  passRouteFrom: { x: 0.3069, y: 0.5021 },
  passPlane: { x: 0.3606, y: 0.4804 },
  passRouteDot: { x: 0.4172, y: 0.4574 },
  /** Globe: southern India (near Chennai) and the bright hub over China. */
  globeIndia: { x: 0.35, y: 0.44 },
  globeChina: { x: 0.62, y: 0.31 },
  /** China map: Guangzhou, which the camera dives into: the bright disc at the
   *  foot of the market map's Canton Tower (955, 516 of 1536 x 1024; the rest
   *  of the map's network is in mapNetwork.ts). */
  mapGuangzhou: { x: 0.6217, y: 0.5039 },
} as const;
