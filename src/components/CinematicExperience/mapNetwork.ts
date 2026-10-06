/**
 * The market network printed on the China map (06-china-map, the owner's
 * "Red-Gold China Market Map" of 2026-10-05), and the order it lights in.
 *
 * Every point is read off that artwork, in its pixels (1536 x 1024): the
 * routes are cubic Béziers fitted to the bright cores of the printed arcs,
 * the boxes are the labels' dark red fills, the pins are the tips and white
 * dots of the red markers. Two things read this file:
 *
 *  - scripts/build_trip_map.mjs, which turns it into the light's field
 *    (06-china-map-light.webp: when each pixel of the map lights);
 *  - mapLight.ts, which draws the light in the film, and the rings that go
 *    out from each city and pin as it lights.
 *
 * So a new map needs its points re-read here and the build run again, or the
 * light will run beside the routes rather than along them. Self-contained (no
 * imports), because the build script loads it with plain Node.
 *
 * The order, in the light's own progress (0 → 1, scrubbed across chapter 06
 * by animations.ts): Guangzhou lights from its foot up, its three markets
 * light as the light reaches them along their routes, the light runs down
 * to Foshan, Foshan lights and then its three markets, and from 0.57 the
 * rest of the country follows, fastest along the province borders, until the
 * whole map is as printed.
 */

export const MAP_PX = { w: 1536, h: 1024 } as const;

type Pt = readonly [number, number];
/** x0, y0, x1, y1 */
type Box = readonly [number, number, number, number];

/** How fast the light runs along a route, in map pixels per unit of progress. */
export const ROUTE_SPEED = 1400;
/** How long a city takes to light, from its foot to the top of its tallest tower. */
export const CITY_RISE = 0.065;
/** How long a label takes to light, left to right, and how long after its pin. */
export const LABEL_WIPE = 0.035;
export const LABEL_DELAY = 0.012;
/** When the rest of the country starts to light, from the network outwards. */
export const FLOOD_FROM = 0.57;

export interface City {
  /** The bright disc at the skyline's foot, where it starts to light. */
  disc: Pt;
  /** The smaller disc under the name. */
  lower: Pt;
  /** Where its buildings stand: they light from the foot of this box up. */
  skyline: Box;
  label: Box;
}

export const CITIES = {
  guangzhou: { disc: [955, 516], lower: [951, 585], skyline: [826, 308, 1098, 534], label: [847, 533, 1054, 569] },
  foshan: { disc: [971, 723], lower: [979, 779], skyline: [848, 612, 1124, 738], label: [906, 737, 1051, 767] },
} as const satisfies Record<string, City>;
export type CityKey = keyof typeof CITIES;

export interface Market {
  city: CityKey;
  /** The marker's tip, on the map. */
  pin: Pt;
  /** The white dot in its head, and the head's radius. */
  dot: Pt;
  head: number;
  label: Box;
}

/** As the artwork spells them; it sets them in lower case except New Asia. */
export const MARKETS = {
  shaxi: { city: "guangzhou", pin: [670, 304], dot: [669, 254], head: 22, label: [574, 203, 758, 240] },
  baima: { city: "guangzhou", pin: [888, 309], dot: [888, 261], head: 22, label: [832, 206, 1042, 242] },
  newAsia: { city: "guangzhou", pin: [1179, 342], dot: [1179, 292], head: 22, label: [1148, 246, 1380, 283] },
  louvre: { city: "foshan", pin: [740, 706], dot: [740, 656], head: 22, label: [629, 612, 827, 649] },
  shunde: { city: "foshan", pin: [1206, 722], dot: [1205, 672], head: 22, label: [1147, 624, 1352, 661] },
  sunlink: { city: "foshan", pin: [862, 803], dot: [864, 767], head: 20, label: [787, 817, 995, 853] },
} as const satisfies Record<string, Market>;
export type MarketKey = keyof typeof MARKETS;

export interface Route {
  from: CityKey;
  to: MarketKey | CityKey;
  /** When the light leaves along it, as a progress; a city's routes leave once it has lit. */
  leaves: number;
  /** The printed arc's visible stretch, from the city's side: x0 y0, two controls, x1 y1. */
  path: readonly [number, number, number, number, number, number, number, number];
}

export const ROUTES: readonly Route[] = [
  { from: "guangzhou", to: "shaxi", leaves: 0.055, path: [898, 478.5, 862, 387.5, 763.5, 308, 670.5, 304] },
  { from: "guangzhou", to: "baima", leaves: 0.055, path: [955.5, 445, 949, 393, 925, 343, 888, 309] },
  { from: "guangzhou", to: "newAsia", leaves: 0.055, path: [993.5, 483.5, 1019.5, 409, 1092, 338, 1164.5, 339] },
  // Down from the disc under GUANGZHOU into Foshan's skyline.
  { from: "guangzhou", to: "foshan", leaves: 0.25, path: [945, 584.5, 974, 615.5, 987, 626.5, 986.5, 690] },
  { from: "foshan", to: "louvre", leaves: 0.05, path: [915, 715, 863, 652.5, 787, 655, 740, 706] },
  { from: "foshan", to: "shunde", leaves: 0.05, path: [1046.5, 712, 1087, 661, 1168, 660, 1208, 722] },
  // Sunlink hangs off the left end of FOSHAN's label: a short glowing link.
  { from: "foshan", to: "sunlink", leaves: 0.025, path: [906, 749, 898, 751, 887, 756, 879, 762] },
];

/** A point on a route's curve, t in 0..1. */
export function routePoint(path: Route["path"], t: number): [number, number] {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * path[0] + b * path[2] + c * path[4] + d * path[6], a * path[1] + b * path[3] + c * path[5] + d * path[7]];
}

/** A route's length in map pixels (measured along 200 chords: well under a pixel off). */
export function routeLength(path: Route["path"]) {
  let len = 0;
  let [px, py] = routePoint(path, 0);
  for (let i = 1; i <= 200; i++) {
    const [x, y] = routePoint(path, i / 200);
    len += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  return len;
}

export interface Schedule {
  /** When each city starts to light. */
  cities: Record<CityKey, number>;
  /** When the light reaches each market's pin. */
  markets: Record<MarketKey, number>;
  /** Each route's start and end, as progress. */
  routes: { route: Route; t0: number; t1: number }[];
}

/**
 * When everything lights. Guangzhou at 0; a Foshan route leaves at its
 * `leaves` after Foshan lights, which is when the route from Guangzhou
 * arrives. Times follow the routes' lengths at ROUTE_SPEED, so a nearer
 * market lights sooner, as a wave going out would.
 */
export function schedule(): Schedule {
  const cities = { guangzhou: 0 } as Record<CityKey, number>;
  const markets = {} as Record<MarketKey, number>;
  const routes: Schedule["routes"] = [];
  // Guangzhou's routes first: the one to Foshan sets when Foshan's leave.
  for (const from of ["guangzhou", "foshan"] as const) {
    for (const route of ROUTES.filter((r) => r.from === from)) {
      const t0 = from === "guangzhou" ? route.leaves : cities.foshan + route.leaves;
      const t1 = t0 + routeLength(route.path) / ROUTE_SPEED;
      routes.push({ route, t0, t1 });
      if (route.to in CITIES) cities[route.to as CityKey] = t1;
      else markets[route.to as MarketKey] = t1;
    }
  }
  return { cities, markets, routes };
}
