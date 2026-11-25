// The header's logo in its Santa hat, Christmas 2026 (the owner, 2026-11-25: "use this logo on website now affhan logo
// ... do some animation on the christmas hat live waving in website ... responsive perfection", then their 3D picture,
// "use this logo instead of the old logo ... the brand logo too perfectly"). The picture is four tiles of one frame
// (scripts/build_christmas_logo.mjs): the hat's cone, tip and pompom, each turning about its own point, under the rest
// of the picture (the logo and the brim, still); ChristmasLogo lays them over one another; lib/christmas.ts turns it on
// and off.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/** A file in public/, as a path sharp can open. */
const publicFile = (p) => fileURLToPath(new URL(`../../public${p}`, import.meta.url));

/** A source file's code, its comments taken out. */
const read = (p) =>
  fs
    .readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const css = read("src/components/ui/christmas-logo.css");
const script = read("scripts/build_christmas_logo.mjs");
const SPRITE = "/affhan-christmas-layers.webp";

/** A @keyframes block's angles, by key. */
function keyframes(name) {
  const block = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`).exec(css);
  assert.ok(block, `@keyframes ${name}`);
  return [...block[1].matchAll(/([\d%,\s]+)\{\s*transform: rotate\((-?[\d.]+)deg\);\s*\}/g)].map((m) => ({
    keys: m[1].trim(),
    deg: Number(m[2]),
  }));
}

test("the header draws the logo in its hat while lib/christmas.ts says so, and public/logo.png again once it does not", () => {
  const nav = read("src/components/sections/Navbar.tsx");
  assert.match(
    nav,
    /\{CHRISTMAS_LOGO \? \(\s*<ChristmasLogo label="AFFHAN Group Logo" className="w-full h-full" \/>\s*\) : \(\s*<Image src="\/logo\.png" alt="AFFHAN Group Logo"/,
    "the navbar, in its own box (40, 48 and 56 px)",
  );
  const phone = read("src/components/mobile/PhoneChrome.tsx");
  assert.match(
    phone,
    /\{CHRISTMAS_LOGO \? \(\s*<ChristmasLogo label="AFFHAN" className="h-10 w-10" \/>\s*\) : \(\s*<Image src="\/logo\.png" alt="AFFHAN"/,
    "the phone frame's header, in the same 40 px",
  );
  assert.match(read("src/lib/christmas.ts"), /export const CHRISTMAS_LOGO = (true|false);/);
});

test("one picture: the layout asks for the very address the CSS draws, and it holds four tiles of 225 px", async () => {
  const at = /export const CHRISTMAS_LOGO_LAYERS = "([^"]+)";/.exec(read("src/lib/christmas.ts"))[1];
  assert.equal(at, SPRITE);
  assert.match(css, new RegExp(`background: url\\("${at.replace(/[.]/g, "\\.")}"\\) 0 0 \\/ 400% 100% no-repeat;`));
  assert.match(read("src/app/layout.tsx"), /if \(CHRISTMAS_LOGO\) preload\(CHRISTMAS_LOGO_LAYERS, \{ as: "image" \}\);/);
  const meta = await sharp(publicFile(at)).metadata();
  assert.equal(meta.format, "webp");
  assert.deepEqual([meta.width, meta.height, meta.hasAlpha], [4 * 225, 225, true]);
  assert.ok(fs.statSync(publicFile(at)).size < 40 * 1024, "light enough to load on every page, as public/logo.png (29 KB) did");
  // The owner's picture itself, kept as asked ("save this as affhan-christmas"), on transparency in the same frame.
  const saved = await sharp(publicFile("/affhan-christmas.png")).metadata();
  assert.deepEqual([saved.width, saved.height, saved.hasAlpha], [900, 900, true]);
});

test("the three that move lie under the rest of the picture, each the whole box, the pompom hanging from the tip", () => {
  assert.match(script, /const tiles = \[await tile\(parts\.cone\), await tile\(parts\.tip\), await tile\(parts\.ball\), await tile\(parts\.rest\)\];/);
  for (const [name, at] of [["cone", "0%"], ["tip", "33.3333%"], ["pompom", "66.6667%"], ["rest", "100%"]]) {
    assert.match(css, new RegExp(`\\.xmas-${name} \\{\\s*background-position: ${at.replace(".", "\\.")} 0;\\s*\\}`), `${name} is its tile`);
  }
  assert.match(css, /\.xmas-logo span \{\s*position: absolute;\s*inset: 0;\s*\}/);
  const tsx = read("src/components/ui/ChristmasLogo.tsx").replace(/\s+/g, " ");
  assert.ok(
    tsx.includes(
      '<span className="xmas-sway"> <span className="xmas-piece xmas-cone" /> <span className="xmas-flop"> <span className="xmas-piece xmas-tip" /> <span className="xmas-bob"> <span className="xmas-piece xmas-pompom" /> </span> </span> </span> <span className="xmas-piece xmas-rest" />',
    ),
    "the cone turning with the tip and the pompom inside it, then the rest of the picture over all",
  );
  assert.match(tsx, /<span role="img" aria-label=\{label\}/);
  // The rest of the picture has a hole where each moving piece is: it never draws one of them still.
  assert.match(script, /for \(let i = 0; i < N; i\+\+\) if \(lab\[i\] !== CONE && lab\[i\] !== TIP && lab\[i\] !== BALL\) copy\(rest, i\);/);
});

test("the logo and its hat fill 89% of the box's height, in its middle, and the box keeps the press", async () => {
  // The owner, over the first look: "slightly make the logo big"; their 3D picture then filled the frame so.
  assert.match(css, /\.xmas-logo \{\s*position: relative;\s*display: block;\s*pointer-events: none;\s*\}/, "no transform of its own: the frame does it");
  const { data, info } = await sharp(publicFile(SPRITE)).raw().toBuffer({ resolveWithObject: true });
  const T = info.height;
  let top = T, bottom = -1, left = T, right = -1;
  for (let k = 0; k < info.width / T; k++) {
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        if (data[(y * info.width + k * T + x) * info.channels + 3] <= 8) continue;
        top = Math.min(top, y); bottom = Math.max(bottom, y + 1); left = Math.min(left, x); right = Math.max(right, x + 1);
      }
    }
  }
  const tall = (bottom - top) / T;
  assert.ok(Math.abs(tall - 0.89) < 0.02, `89% of the height (${(tall * 100).toFixed(1)}%)`);
  assert.ok(Math.abs((top + bottom) / 2 / T - 0.5) < 0.01, `centred top to bottom (${top} to ${bottom} of ${T})`);
  assert.ok(Math.abs((left + right) / 2 / T - 0.5) < 0.01, `and across (${left} to ${right} of ${T})`);
  assert.ok(left >= 0 && right <= T, "inside its box across, so nothing beside it moves");
});

test("each piece turns where the script cut it to turn", () => {
  const map = /const MAP = \{ size: (\d+), left: (\d+), top: (\d+), from: (\d+) \};/.exec(script).slice(1).map(Number);
  const [size, left, top, from] = map;
  const frame = Number(/const FRAME = (\d+);/.exec(script)[1]);
  const pivots = /const PIVOTS = \{ cone: toFrame\(\[(\d+), (\d+)\]\), tip: toFrame\(\[(\d+), (\d+)\]\), pompom: toFrame\(\[(\d+), (\d+)\]\) \};/.exec(script);
  assert.ok(pivots, "the script's PIVOTS");
  const pct = (x, y) => `${((((x * size) / from - left) / frame) * 100).toFixed(2)}% ${((((y * size) / from - top) / frame) * 100).toFixed(2)}%`;
  const p = pivots.slice(1).map(Number);
  assert.match(css, new RegExp(`\\.xmas-sway \\{\\s*transform-origin: ${pct(p[0], p[1])};`), "the cone, on its base");
  assert.match(css, new RegExp(`\\.xmas-flop \\{\\s*transform-origin: ${pct(p[2], p[3])};`), "the tip, at the fold");
  assert.match(css, new RegExp(`\\.xmas-bob \\{\\s*transform-origin: ${pct(p[4], p[5])};`), "the pompom, where it hangs");
});

test("the tip never swings out past the fold's shadow the script draws behind it, and every round ends where it began", () => {
  const wedge = Number(/const FOLD_OPENS_DEG = (\d+);/.exec(script)[1]);
  assert.match(script, /Math\.tan\(\(FOLD_OPENS_DEG \* Math\.PI\) \/ 180\)/, "the wedge is drawn to it");
  const flop = keyframes("xmas-flop");
  assert.ok(Math.min(...flop.map((k) => k.deg)) > -wedge, `out no further than ${wedge} degrees`);
  for (const name of ["xmas-sway", "xmas-flop", "xmas-bob"]) {
    const k = keyframes(name);
    assert.match(k[0].keys, /^0%,\s*100%$/, `${name} begins and ends on one key`);
    // Each key a turning point: the swing goes the other way after it (so the round never pauses part-way).
    const degs = [...k.map((x) => x.deg), k[0].deg];
    for (let i = 1; i < degs.length - 1; i++) {
      assert.ok((degs[i] - degs[i - 1]) * (degs[i + 1] - degs[i]) < 0, `${name}: ${k[i].keys} turns the swing`);
    }
  }
});

test("only transforms move, one ten-second round for all three, and nothing moves for anyone who asks for less motion", () => {
  const moving = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference) {"));
  const animations = [...css.matchAll(/animation: ([^;]+);/g)].map((m) => m[1]);
  assert.equal(animations.length, 3);
  for (const a of animations) {
    assert.match(a, /^xmas-(sway|flop|bob) 10s cubic-bezier\(0\.37, 0, 0\.63, 1\)( 0\.25s)? infinite$/);
    assert.ok(moving.includes(`animation: ${a};`), `${a} runs only under prefers-reduced-motion: no-preference`);
  }
  for (const name of ["xmas-sway", "xmas-flop", "xmas-bob"]) {
    const block = new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`).exec(css)[1];
    assert.deepEqual([...new Set([...block.matchAll(/^\s+([a-z-]+):/gm)].map((m) => m[1]))], ["transform"], `${name} moves only transform`);
  }
});
