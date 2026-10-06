// Build the free China trip film's map (chapter 06) from the owner's
// artwork, and the field its light is drawn from.
//
//   node scripts/build_trip_map.mjs ["public/Free-China-Trip/Red-Gold China Market Map.png"]
//
// Node 22.18+ (or 23.6+), which loads mapNetwork.ts as it is; it warns that
// it parsed that file as an ES module, which is harmless.
//
// The source is the owner's PNG (a cut-out, 1536 x 1024), which is never
// served or committed. From it this writes:
//
//   public/free-china-trip/06-china-map.webp       1536 x 1024, the film's map
//   public/free-china-trip/06-china-map-960.webp   960 x 640, chosen on phones
//   public/free-china-trip/06-china-map-light.webp 768 x 512, the light's field
//
// The two pictures at the settings the first map shipped with (quality 70,
// alpha 80, smart subsampling): re-encoding that map with them gives its
// shipped files to the byte. The field is lossless (its numbers must arrive
// exactly): 62 KB as WebP, against 87 KB as PNG.
//
// THE FIELD tells the film when each pixel of the map lights, as the light
// spreads across it (mapLight.ts draws it; the order is set out in
// mapNetwork.ts, from the artwork's own routes, pins and labels):
//
//   red    when it lights, as the light's progress (0..1)
//   green  how close it is to a printed route: the light's head burns
//          brightest there, so it reads as running along the line
//   blue   how soft its edge is: 0 for the network itself (it lights
//          crisply, as it is reached), 1 for the rest (lit by the spread)
//
// The network sets its own times. Everything else is found by a shortest-
// time spread out from it: slowly at first (the light bleeding around the
// lit routes and cities), then from FLOOD_FROM much faster, and fastest
// along the printed gold lines (the province borders, the coast, the
// stars), so the country lights along its borders first and fills in
// between. Its speed is solved for, so the last pixel lights at 0.91 and
// the map is whole, as printed, by the end of the light.
//
// Run it again after replacing the map, once the new artwork's points have
// been re-read into mapNetwork.ts.

import fs from "node:fs";
import sharp from "sharp";
import { CITIES, FLOOD_FROM, CITY_RISE, LABEL_DELAY, LABEL_WIPE, MAP_PX, MARKETS, routePoint, routeLength, schedule } from "../src/components/CinematicExperience/mapNetwork.ts";

const SRC = process.argv[2] ?? "public/Free-China-Trip/Red-Gold China Market Map.png";
const OUT = "public/free-china-trip";
const WEBP = { quality: 70, alphaQuality: 80, effort: 6, smartSubsample: true };

// ---- The pictures -----------------------------------------------------------
const meta = await sharp(SRC).metadata();
if (meta.width !== MAP_PX.w || meta.height !== MAP_PX.h) {
  throw new Error(`${SRC} is ${meta.width} x ${meta.height}; mapNetwork.ts is read off a ${MAP_PX.w} x ${MAP_PX.h} map`);
}
await sharp(SRC).webp(WEBP).toFile(`${OUT}/06-china-map.webp`);
await sharp(SRC).resize({ width: 960 }).webp(WEBP).toFile(`${OUT}/06-china-map-960.webp`);

// ---- The field ----------------------------------------------------------------
// Half the map's resolution: the light is soft, and the GPU filters between texels.
const FW = MAP_PX.w / 2, FH = MAP_PX.h / 2, N = FW * FH, S = 2;
// Read from the file that ships, so the field matches what the film draws.
const px = await sharp(`${OUT}/06-china-map.webp`).resize(FW, FH, { kernel: "lanczos3" }).ensureAlpha().raw().toBuffer();
const alpha = new Float32Array(N), line = new Float32Array(N), terrain = new Uint8Array(N);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
for (let i = 0; i < N; i++) {
  const r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
  alpha[i] = px[i * 4 + 3] / 255;
  // The printed gold lines: green is what sets them apart from the red ground
  // (mapLight.ts uses the same measure, so the two agree on what a line is).
  line[i] = smooth(0.32, 0.75, g);
  terrain[i] = r > 0.35 && g < 0.42 * r && b < 0.42 * r ? 1 : 0;
}
// Each texel's centre, in map pixels.
const X = (i) => ((i % FW) + 0.5) * S;
const Y = (i) => (Math.floor(i / FW) + 0.5) * S;
const box = ([x0, y0, x1, y1], m, fn) => {
  for (let ty = Math.max(0, Math.floor((y0 - m) / S)); ty <= Math.min(FH - 1, Math.ceil((y1 + m) / S)); ty++) {
    for (let tx = Math.max(0, Math.floor((x0 - m) / S)); tx <= Math.min(FW - 1, Math.ceil((x1 + m) / S)); tx++) fn(ty * FW + tx);
  }
};
const clamp01 = (v) => Math.min(1, Math.max(0, v));

const plan = schedule();
// Three layers by precedence: a label is never cut by the route passing under
// it; a route is never lit early by the city it leaves; the rest take the
// earliest time any of them gives.
const labelT = new Float32Array(N).fill(Infinity);
const routeT = new Float32Array(N).fill(Infinity);
const restT = new Float32Array(N).fill(Infinity);
const near = new Float32Array(N);

// A label lights left to right, its glowing rim included.
const label = ([x0, y0, x1, y1], t) => {
  const m = 5, r = (y1 - y0) / 2 + m;
  box([x0, y0, x1, y1], m, (i) => {
    const x = X(i), y = Y(i);
    // A rounded box: inside the straight part, or within r of an end's centre line.
    const cx = Math.min(Math.max(x, x0 - m + r), x1 + m - r), cy = (y0 + y1) / 2;
    if (Math.hypot(x - cx, y - cy) > r) return;
    labelT[i] = Math.min(labelT[i], t + LABEL_WIPE * clamp01((x - x0 + m) / (x1 - x0 + 2 * m)));
  });
};

// Cities: the buildings light from the foot up, then the name; the discs first.
for (const [key, c] of Object.entries(CITIES)) {
  const t = plan.cities[key];
  const [x0, y0, x1, y1] = c.skyline;
  box(c.skyline, 0, (i) => {
    if (terrain[i] || alpha[i] < 0.5) return;
    const y = Y(i);
    if (y < y0 || y > y1 || X(i) < x0 || X(i) > x1) return;
    restT[i] = Math.min(restT[i], t + CITY_RISE * clamp01((c.disc[1] - y) / (c.disc[1] - y0)));
  });
  for (const [d, rx, ry, at] of [[c.disc, 62, 22, 0], [c.lower, 50, 18, 0.04]]) {
    box([d[0] - rx, d[1] - ry, d[0] + rx, d[1] + ry], 0, (i) => {
      const k = Math.hypot((X(i) - d[0]) / rx, (Y(i) - d[1]) / ry);
      if (k <= 1) restT[i] = Math.min(restT[i], t + at + 0.012 * k);
    });
  }
  label(c.label, t + 0.02);
}

// Markets: the pin fills with light from its tip up, its ring on the ground
// at once, then its name.
for (const [key, m] of Object.entries(MARKETS)) {
  const t = plan.markets[key];
  const [px0, py0] = m.pin, [dx, dy] = m.dot, h = m.head;
  const top = dy - h;
  box([Math.min(px0, dx) - h - 4, top - 2, Math.max(px0, dx) + h + 4, py0 + 16], 0, (i) => {
    const x = X(i), y = Y(i);
    const inHead = Math.hypot(x - dx, y - dy) <= h + 2;
    // The cone from the head down to the tip.
    const f = (py0 - y) / (py0 - dy);
    const inCone = f >= 0 && f <= 1 && Math.abs(x - (px0 + (dx - px0) * f)) <= h * 0.85 * f + 2;
    if (inHead || inCone) restT[i] = Math.min(restT[i], t + 0.022 * clamp01((py0 - y) / (py0 - top)));
    const k = Math.hypot((x - px0) / 34, (y - py0 - 2) / 13);
    if (k <= 1) restT[i] = Math.min(restT[i], t + 0.006 * k);
  });
  label(m.label, t + LABEL_DELAY);
}

// Routes: light runs along each at ROUTE_SPEED; a tube of 16px around the
// printed arc lights as the head passes, from the line outwards.
const TUBE = 16, V_LAT = 420, SIGMA = 5;
for (const { route, t0, t1 } of plan.routes) {
  const len = routeLength(route.path);
  const M = Math.max(40, Math.round(len));
  const pts = [], cum = [0];
  for (let k = 0; k <= M; k++) pts.push(routePoint(route.path, k / M));
  for (let k = 1; k <= M; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  box([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], TUBE, (i) => {
    const x = X(i), y = Y(i);
    let best = Infinity, s = 0;
    for (let k = 0; k <= M; k++) {
      const d = (pts[k][0] - x) ** 2 + (pts[k][1] - y) ** 2;
      if (d < best) { best = d; s = cum[k]; }
    }
    const d = Math.sqrt(best);
    if (d > TUBE) return;
    routeT[i] = Math.min(routeT[i], t0 + (s / cum[M]) * (t1 - t0) + d / V_LAT);
    near[i] = Math.max(near[i], Math.exp(-((d / SIGMA) ** 2)));
  });
}

const T = new Float32Array(N).fill(Infinity);
const fixed = new Uint8Array(N);
for (let i = 0; i < N; i++) {
  const t = labelT[i] < Infinity ? labelT[i] : routeT[i] < Infinity ? routeT[i] : restT[i];
  if (t < Infinity) { T[i] = t; fixed[i] = 1; }
}

// ---- The spread: shortest time out from the network --------------------------
// Before FLOOD_FROM the light only bleeds around what is lit (V_GLOW); after
// it, it floods at vFlood, (1 + LINE_BOOST) times faster on a printed line.
// Speeds never fall with time, so arriving later never means arriving
// sooner, and a plain Dijkstra on arrival times is exact.
const V_GLOW = 90, LINE_BOOST = 7;
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

function spread(vFlood) {
  const t = Float32Array.from(T);
  const done = new Uint8Array(N);
  // A binary heap of [time, index].
  const hk = [], hv = [];
  const push = (k, v) => {
    let n = hk.length;
    hk.push(k); hv.push(v);
    while (n > 0) { const p = (n - 1) >> 1; if (hk[p] <= k) break; hk[n] = hk[p]; hv[n] = hv[p]; n = p; }
    hk[n] = k; hv[n] = v;
  };
  const pop = () => {
    const k = hk[0], v = hv[0], lk = hk.pop(), lv = hv.pop();
    if (hk.length) {
      let n = 0;
      for (;;) {
        let c = 2 * n + 1;
        if (c >= hk.length) break;
        if (c + 1 < hk.length && hk[c + 1] < hk[c]) c++;
        if (hk[c] >= lk) break;
        hk[n] = hk[c]; hv[n] = hv[c]; n = c;
      }
      hk[n] = lk; hv[n] = lv;
    }
    return [k, v];
  };
  for (let i = 0; i < N; i++) if (fixed[i]) push(t[i], i);
  while (hk.length) {
    const [k, i] = pop();
    if (done[i] || k > t[i]) continue;
    done[i] = 1;
    const x = i % FW, y = (i / FW) | 0;
    for (const [ox, oy, step] of NB) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= FW || ny >= FH) continue;
      const j = ny * FW + nx;
      if (done[j] || fixed[j]) continue;
      const L = step * S;
      // Off the map (the strait to Taiwan, the gaps between the dashes) the
      // flood still crosses, more slowly, and nothing glows.
      const off = alpha[j] < 0.25;
      const vf = off ? vFlood * 0.6 : vFlood * (1 + LINE_BOOST * 0.5 * (line[i] + line[j]));
      const vg = off ? V_GLOW * 0.3 : V_GLOW;
      let dt;
      if (k >= FLOOD_FROM) dt = L / vf;
      else {
        const glowFor = FLOOD_FROM - k;
        dt = L / vg <= glowFor ? L / vg : glowFor + (L - glowFor * vg) / vf;
      }
      if (k + dt < t[j]) { t[j] = k + dt; push(t[j], j); }
    }
  }
  return t;
}
const lastLit = (t) => { let m = 0; for (let i = 0; i < N; i++) if (alpha[i] >= 0.5 && t[i] > m) m = t[i]; return m; };

// Solve for the flood's speed: the last pixel of the map lights at 0.91.
const TARGET = 0.91;
let lo = 100, hi = 20000, field = null;
for (let it = 0; it < 18; it++) {
  const mid = Math.sqrt(lo * hi);
  const t = spread(mid);
  if (lastLit(t) > TARGET) lo = mid; else { hi = mid; field = t; }
}
field ??= spread(hi);

const out = Buffer.alloc(N * 3);
for (let i = 0; i < N; i++) {
  out[i * 3] = Math.round(clamp01(field[i] === Infinity ? 1 : field[i]) * 255);
  out[i * 3 + 1] = Math.round(near[i] * 255);
  out[i * 3 + 2] = fixed[i] ? 0 : 255;
}
await sharp(out, { raw: { width: FW, height: FH, channels: 3 } }).webp({ lossless: true, effort: 6, exact: true }).toFile(`${OUT}/06-china-map-light.webp`);

const size = (f) => fs.statSync(`${OUT}/${f}`).size;
console.log(`flood speed ${Math.round(hi)} px per unit; last pixel lights at ${lastLit(field).toFixed(3)}`);
for (const [k, t] of Object.entries(plan.cities)) console.log(`  ${k.padEnd(10)} lights at ${t.toFixed(3)}`);
for (const [k, t] of Object.entries(plan.markets)) console.log(`  ${k.padEnd(10)} lights at ${t.toFixed(3)}`);
for (const f of ["06-china-map.webp", "06-china-map-960.webp", "06-china-map-light.webp"]) console.log(`${OUT}/${f}  ${size(f).toLocaleString("en")} bytes`);
