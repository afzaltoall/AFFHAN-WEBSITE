// The header's logo in its Santa hat, Christmas 2026 (the owner, 2026-11-25: "use this logo on website now affhan logo
// ... do some animation on the christmas hat live waving in website ... responsive perfection"). The logo and the hat
// are five tiles of one picture (scripts/build_christmas_logo.mjs) laid over one another by ChristmasLogo, the brim
// still, the cone, its tip and the pompom turning each about its own point; lib/christmas.ts turns it on and off.
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

test("one picture: the layout asks for the very address the CSS draws, and it holds five tiles of 225 px", async () => {
  const at = /export const CHRISTMAS_LOGO_LAYERS = "([^"]+)";/.exec(read("src/lib/christmas.ts"))[1];
  assert.equal(at, "/affhan-christmas-layers.webp");
  assert.match(css, new RegExp(`background: url\\("${at.replace(/[.]/g, "\\.")}"\\) 0 0 \\/ 500% 100% no-repeat;`));
  assert.match(read("src/app/layout.tsx"), /if \(CHRISTMAS_LOGO\) preload\(CHRISTMAS_LOGO_LAYERS, \{ as: "image" \}\);/);
  const meta = await sharp(publicFile(at)).metadata();
  assert.equal(meta.format, "webp");
  assert.deepEqual([meta.width, meta.height, meta.hasAlpha], [5 * 225, 225, true]);
  // The owner's picture itself, kept as asked ("save this as affhan-christmas"), on transparency in logo.png's frame.
  const saved = await sharp(publicFile("/affhan-christmas.png")).metadata();
  assert.deepEqual([saved.width, saved.height, saved.hasAlpha], [900, 900, true]);
});

test("the pieces in the script's order, each the whole box, the brim on top and the pompom hanging from the tip", () => {
  const order = ["base", "cone", "tip", "pompom", "brim"];
  assert.match(script, /const tiles = \[base, await tile\(parts\.cone\), await tile\(parts\.tip\), await tile\(parts\.ball\), await tile\(parts\.brim\)\];/);
  order.forEach((name, k) => {
    if (k === 0) return;
    assert.match(css, new RegExp(`\\.xmas-${name} \\{\\s*background-position: ${k * 25}% 0;\\s*\\}`), `${name} is tile ${k}`);
  });
  assert.match(css, /\.xmas-logo span \{\s*position: absolute;\s*inset: 0;\s*\}/);
  const tsx = read("src/components/ui/ChristmasLogo.tsx").replace(/\s+/g, " ");
  assert.ok(
    tsx.includes(
      '<span className="xmas-piece xmas-base" /> <span className="xmas-sway"> <span className="xmas-piece xmas-cone" /> <span className="xmas-flop"> <span className="xmas-piece xmas-tip" /> <span className="xmas-bob"> <span className="xmas-piece xmas-pompom" /> </span> </span> </span> <span className="xmas-piece xmas-brim" />',
    ),
    "logo, then the cone turning with the tip and the pompom inside it, then the brim over all",
  );
  assert.match(tsx, /<span role="img" aria-label=\{label\}/);
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
  const wedge = Number(/Math\.tan\(\((\d+) \* Math\.PI\) \/ 180\)/.exec(script)[1]);
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
