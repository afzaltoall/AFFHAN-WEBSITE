// The AFFHAN logo in its Santa hat (Christmas 2026), from the owner's picture, in pieces the header can move.
//
//   node scripts/build_christmas_logo.mjs --source <the owner's picture>   # cut it off its black ground, then the pieces
//   node scripts/build_christmas_logo.mjs                                  # the pieces only, from the saved logo
//   ... --preview <folder>                                                 # also the pieces laid together, at rest
//
// What it writes:
//   public/affhan-christmas.png          the owner's logo with the hat on transparency, 900 x 900, in public/logo.png's
//                                        own frame (four times its 225 px): the A sits where logo.png has it, so the
//                                        file can stand in for logo.png in any square box.
//   public/affhan-christmas-layers.webp  five 225 px tiles side by side, for ChristmasLogo: logo.png itself, then the
//                                        hat in four pieces (the cone, the floppy tip, the pompom, the brim), each on
//                                        the same frame, so laid one over another they are the picture.
//
// Why pieces. The brim sits on the A and stays; the cone sways a little on it, its tip swings from the fold, and the
// pompom swings a moment after the tip. A piece that moves uncovers what was behind it, so each carries a little more
// than shows: the cone runs on under the brim and under the tip's inner edge, and the tip under the pompom. Under the
// pompom the ring is logo.png's own, whole, which is why the pieces go over logo.png and not over the picture's logo.
//
// The picture came as a JPEG on black, with no transparency. Each edge pixel's alpha is how far it is from black
// toward the colour just inside it (that colour carried outward a pixel at a time), so it comes off without a dark rim.
// The fur's darker strands at its edge stay: on the white header they are what draws the white fur.
//
// Its logo is logo.png's, redrawn: the word measures 0.1915 of the picture's against logo.png's, and the A, matched on
// its own (its middle, below the brim), lands within 0.05 px across and 0.46 px down of logo.png's A at 225 px. The
// picture is therefore resized to 960 px and cut at (3, 5) for the 900 frame (MAP), which puts its A on logo.png's.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_LOGO = path.join(ROOT, "public", "affhan-christmas.png");
const OUT_LAYERS = path.join(ROOT, "public", "affhan-christmas-layers.webp");
const BASE = path.join(ROOT, "public", "logo.png");

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const SOURCE = arg("--source");
const PREVIEW = arg("--preview");

/** The owner's picture (1254 px) to the 900 frame: resized to 960 px, then cut at (3, 5). */
const MAP = { size: 960, left: 3, top: 5, from: 1254 };
const FRAME = 900;
const TILE = 225;
const toFrame = ([x, y]) => [(x * MAP.size) / MAP.from - MAP.left, (y * MAP.size) / MAP.from - MAP.top];

// The hat's own shapes, in the owner's picture's pixels (read off it on a 20 px grid).
/** The line between the cone and its floppy tip: from the fold at the top down the crease to the pompom. */
const CUT = [[735, 95], [742, 160], [757, 205], [768, 250], [775, 280], [775, 340]].map(toFrame);
/** The pompom: centre and radius. */
const POMPOM = { c: toFrame([814, 300]), r: (38 * MAP.size) / MAP.from };
/** Where each piece turns: the cone on its base under the brim, the tip at the fold, the pompom where it hangs. */
const PIVOTS = { cone: toFrame([645, 200]), tip: toFrame([737, 100]), pompom: toFrame([806, 268]) };

// ---------------------------------------------------------------------------------------------------------------------
// 1. The owner's picture off its black ground, into the 900 frame.

async function cutFromBlack(source) {
  const { data, info } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  if (W !== MAP.from || H !== MAP.from) throw new Error(`expected the ${MAP.from} px picture, got ${W} x ${H}`);
  const N = W * H;
  const strength = new Uint8Array(N);
  for (let i = 0; i < N; i++) strength[i] = Math.max(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
  const ground = (i) => strength[i] <= 10;

  // Solid: not ground, and no ground within 2 px.
  const solid = new Uint8Array(N);
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (ground(i)) continue;
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) if (ground(i + dy * W + dx)) { ok = false; break; }
      solid[i] = ok ? 1 : 0;
    }
  }

  // The colour just inside, carried outward a pixel at a time, 8 px out.
  const F = new Float32Array(N * 3);
  const known = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (solid[i]) { known[i] = 1; F[i * 3] = data[i * 3]; F[i * 3 + 1] = data[i * 3 + 1]; F[i * 3 + 2] = data[i * 3 + 2]; }
  spread(F, known, W, H, 8, () => true);

  const rgba = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    if (solid[i]) {
      rgba[i * 4] = data[i * 3]; rgba[i * 4 + 1] = data[i * 3 + 1]; rgba[i * 4 + 2] = data[i * 3 + 2]; rgba[i * 4 + 3] = 255;
      continue;
    }
    if (!known[i] || strength[i] <= 6) continue; // the ground, and JPEG's own 1-6 on it
    const f = [F[i * 3], F[i * 3 + 1], F[i * 3 + 2]];
    const ff = f[0] * f[0] + f[1] * f[1] + f[2] * f[2];
    const a = ff > 0 ? Math.max(0, Math.min(1, (data[i * 3] * f[0] + data[i * 3 + 1] * f[1] + data[i * 3 + 2] * f[2]) / ff)) : 0;
    rgba[i * 4] = Math.round(f[0]); rgba[i * 4 + 1] = Math.round(f[1]); rgba[i * 4 + 2] = Math.round(f[2]); rgba[i * 4 + 3] = Math.round(a * 255);
  }
  const resized = await sharp(rgba, { raw: { width: W, height: H, channels: 4 } })
    .resize(MAP.size, MAP.size, { kernel: "lanczos3" })
    .raw()
    .toBuffer();
  return sharp(resized, { raw: { width: MAP.size, height: MAP.size, channels: 4 } })
    .extract({ left: MAP.left, top: MAP.top, width: FRAME, height: FRAME })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

/**
 * Carries known colours outward a pixel at a time (each new pixel the mean of its known neighbours), `steps` times,
 * into the pixels `may` allows. F is RGB per pixel; known marks which are set.
 */
function spread(F, known, W, H, steps, may) {
  for (let step = 0; step < steps; step++) {
    const add = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (known[i] || !may(i)) continue;
        let n = 0, r = 0, g = 0, b = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const j = i + dy * W + dx;
            if (known[j]) { n++; r += F[j * 3]; g += F[j * 3 + 1]; b += F[j * 3 + 2]; }
          }
        }
        if (n) add.push(i, r / n, g / n, b / n);
      }
    }
    if (!add.length) return;
    for (let k = 0; k < add.length; k += 4) {
      const i = add[k];
      known[i] = 1; F[i * 3] = add[k + 1]; F[i * 3 + 1] = add[k + 2]; F[i * 3 + 2] = add[k + 3];
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. The hat in pieces, in the 900 frame.

const NONE = 0, LOGO = 1, CONE = 2, TIP = 3, BRIM = 4, BALL = 5;

function kind(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (b > r + 18 && g > r + 8) return LOGO;
  if (r > g + 35 && r > b + 25) return CONE; // the red, its pink edge against the fur, its darker folds
  if (mx > 40 && mx - mn < 0.22 * mx + 8) return BRIM; // the fur, white to grey
  return NONE;
}

/** Signed distance across the cut, in px: above 0 on the tip's side. */
function acrossCut(x, y) {
  if (y <= CUT[0][1]) return x - CUT[0][0];
  for (let k = 1; k < CUT.length; k++) {
    const [x0, y0] = CUT[k - 1], [x1, y1] = CUT[k];
    if (y <= y1) return x - (x0 + ((x1 - x0) * (y - y0)) / (y1 - y0));
  }
  return x - CUT[CUT.length - 1][0];
}

function pieces(rgba) {
  const W = FRAME, H = FRAME, N = W * H;
  const label = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (rgba[i * 4 + 3] === 0) continue;
    label[i] = kind(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  }
  // What is left (dark folds, dark strands of fur) takes the nearest piece's label.
  for (let pass = 0; pass < 12; pass++) {
    let changed = 0;
    const next = label.slice();
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (label[i] !== NONE || rgba[i * 4 + 3] === 0) continue;
        for (const j of [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1]) {
          if (label[j] !== NONE) { next[i] = label[j]; changed++; break; }
        }
      }
    }
    label.set(next);
    if (!changed) break;
  }
  // Then the shapes decide: red past the cut is the tip, fur round the pompom's centre the pompom.
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i - x) / W;
    if (label[i] === CONE || label[i] === TIP) label[i] = acrossCut(x, y) > 0 ? TIP : CONE;
    else if (label[i] === BRIM || label[i] === BALL) label[i] = Math.hypot(x - POMPOM.c[0], y - POMPOM.c[1]) <= POMPOM.r + 8 ? BALL : BRIM;
  }

  const layer = () => Buffer.alloc(N * 4);
  const copy = (to, i, alpha = rgba[i * 4 + 3]) => {
    to[i * 4] = rgba[i * 4]; to[i * 4 + 1] = rgba[i * 4 + 1]; to[i * 4 + 2] = rgba[i * 4 + 2]; to[i * 4 + 3] = alpha;
  };
  const cone = layer(), tip = layer(), brim = layer(), ball = layer();
  const solid = (i) => rgba[i * 4 + 3] === 255;

  // The cone, and under the tip's inner edge the fold's own cloth: the tip's edge as it is for the width the two are
  // faded across (so at rest they make the picture), then the crease's shadow carried on, in a wedge that opens from
  // the fold as wide as the tip swings out (12 degrees; christmas-logo.css swings it 10 at most). It stops where the
  // cone stops meeting the tip: the last row, going down from the fold, with the cone at the cut (a row or three
  // missing aside). Below it the picture already has a gap between them, the tip hangs free, and swinging out it
  // shows only what is behind the hat.
  const FEATHER = 3;
  const touches = new Uint8Array(H);
  for (let i = 0; i < N; i++) {
    if (label[i] !== CONE) continue;
    const x = i % W, y = (i - x) / W;
    const d = acrossCut(x, y);
    if (d > -3 && d <= 0) touches[y] = 1;
  }
  let foot = Math.ceil(PIVOTS.tip[1]);
  for (let y = foot, miss = 0; y < H && miss <= 3; y++) {
    if (touches[y]) { foot = y; miss = 0; } else miss++;
  }
  console.log(`the cone meets the tip down to row ${foot} of ${FRAME} (${((foot + MAP.top) * MAP.from / MAP.size).toFixed(0)} in the picture)`);
  const opens = (x, y) => {
    const d = acrossCut(x, y);
    return d > 0 && y <= foot && d <= 4 + Math.max(0, y - PIVOTS.tip[1]) * Math.tan((12 * Math.PI) / 180);
  };
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i - x) / W;
    if (label[i] === CONE) copy(cone, i);
    else if (label[i] === TIP && acrossCut(x, y) <= FEATHER) copy(cone, i);
    if (label[i] === BRIM) copy(brim, i);
    if (label[i] === BALL) copy(ball, i);
    // The tip, faded in across the cut so its join with the cone has no edge.
    if (label[i] === TIP || label[i] === CONE) {
      const d = acrossCut(x, y);
      if (d > -FEATHER) {
        const t = Math.min(1, (d + FEATHER) / (2 * FEATHER));
        const w = t * t * (3 - 2 * t);
        if (w > 0) copy(tip, i, Math.round(rgba[i * 4 + 3] * w));
      }
    }
  }
  // The cone under the brim: its red carried into the brim's solid fur, 64 px in.
  extendUnder(cone, (i) => label[i] === CONE, (i) => label[i] === BRIM && solid(i), 64);
  // The fold's wedge under the tip, from the cone's edge at the cut.
  extendUnder(cone, (i) => label[i] === CONE || label[i] === TIP, (i) => label[i] === TIP && solid(i) && opens(i % W, Math.floor(i / W)), 40);
  // The tip under the pompom, 24 px in.
  extendUnder(tip, (i) => label[i] === TIP, (i) => label[i] === BALL && solid(i), 24);

  const count = (k) => label.reduce((n, v) => n + (v === k ? 1 : 0), 0);
  console.log(`pieces (px at 900): cone ${count(CONE)}, tip ${count(TIP)}, brim ${count(BRIM)}, pompom ${count(BALL)}, logo ${count(LOGO)}`);
  return { cone, tip, ball, brim };
}

/** Paints `into` (opaque) where `under` allows, near what `from` marks, with `from`'s colours carried over. */
function extendUnder(into, from, under, steps) {
  const W = FRAME, H = FRAME, N = W * H;
  const F = new Float32Array(N * 3);
  const known = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (from(i) && into[i * 4 + 3] === 255) { known[i] = 1; F[i * 3] = into[i * 4]; F[i * 3 + 1] = into[i * 4 + 1]; F[i * 3 + 2] = into[i * 4 + 2]; }
  }
  const seeded = known.slice();
  spread(F, known, W, H, steps, under);
  for (let i = 0; i < N; i++) {
    if (!known[i] || seeded[i] || into[i * 4 + 3] === 255) continue;
    into[i * 4] = Math.round(F[i * 3]); into[i * 4 + 1] = Math.round(F[i * 3 + 1]); into[i * 4 + 2] = Math.round(F[i * 3 + 2]); into[i * 4 + 3] = 255;
  }
}

// ---------------------------------------------------------------------------------------------------------------------

if (SOURCE) {
  const png = await cutFromBlack(SOURCE);
  fs.writeFileSync(OUT_LOGO, png);
  console.log(`wrote ${path.relative(ROOT, OUT_LOGO)} (${(png.length / 1024).toFixed(0)} KB)`);
}
const logo = await sharp(OUT_LOGO).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (logo.info.width !== FRAME || logo.info.height !== FRAME) throw new Error(`${OUT_LOGO} is not ${FRAME} px`);
const parts = pieces(logo.data);

const tile = (buf) =>
  sharp(buf, { raw: { width: FRAME, height: FRAME, channels: 4 } }).resize(TILE, TILE, { kernel: "lanczos3" }).png().toBuffer();
const base = await sharp(BASE).ensureAlpha().png().toBuffer();
const meta = await sharp(base).metadata();
if (meta.width !== TILE || meta.height !== TILE) throw new Error(`${BASE} is not ${TILE} px`);
// The order ChristmasLogo's CSS reads them in.
const tiles = [base, await tile(parts.cone), await tile(parts.tip), await tile(parts.ball), await tile(parts.brim)];
const sheet = sharp({ create: { width: TILE * tiles.length, height: TILE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(tiles.map((input, k) => ({ input, left: k * TILE, top: 0 })));
const webp = await sheet.clone().webp({ lossless: true, effort: 6 }).toBuffer();
fs.writeFileSync(OUT_LAYERS, webp);
console.log(`wrote ${path.relative(ROOT, OUT_LAYERS)} (${(webp.length / 1024).toFixed(1)} KB, ${tiles.length} tiles of ${TILE} px)`);

// Where each piece turns, as ChristmasLogo's CSS writes it (percent of the box).
const pct = ([x, y]) => `${((x / FRAME) * 100).toFixed(2)}% ${((y / FRAME) * 100).toFixed(2)}%`;
console.log(`turns at: cone ${pct(PIVOTS.cone)}, tip ${pct(PIVOTS.tip)}, pompom ${pct(PIVOTS.pompom)}`);

if (PREVIEW) {
  fs.mkdirSync(PREVIEW, { recursive: true });
  const atRest = await sharp(base)
    .composite(tiles.slice(1).map((input) => ({ input })))
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(PREVIEW, "at-rest-225.png"), atRest);
  for (const [k, name] of ["base", "cone", "tip", "pompom", "brim"].entries()) fs.writeFileSync(path.join(PREVIEW, `tile-${k}-${name}.png`), tiles[k]);
  console.log(`preview in ${PREVIEW}`);
}
