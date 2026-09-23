import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

// Is the carousel's halo blocky, and does it stay blocky?
//
//   node tools/audit/101-carousel-halo.mjs [baseUrl]
//
// .fan-card carries `box-shadow: 0 24px 48px -14px rgba(15,23,42,.4)` AND
// `will-change: transform`, inside a parent with `perspective: 1400px`, and
// GSAP animates each card's `scale`. will-change promotes the card to its own
// compositor layer; the layer is rasterised once at whatever scale it had, and
// the compositor then stretches that texture as the scale changes — shadow
// included. A 48px blur magnified from a small raster is exactly the
// stair-stepped halo in the report.
//
// So this shoots the carousel at 0.5s, 1s, 2s, 5s and 10s after load with the
// CPU throttled 4x, and at each moment records the active card's computed
// scale and whether the browser is still holding a composited layer for it.
// If the halo is sharp once the animation settles, the layer was re-rasterised
// and the artefact is transient; if it stays blocky, it was not.
//
// Read-only. Its own browser, its own profile, its own pid.

const BASE = process.argv[2] ?? 'http://localhost:3101';
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9617);
const OUT = 'tools/audit/halo';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = [500, 1000, 2000, 5000, 10000];

fs.mkdirSync(OUT, { recursive: true });
const PROFILE = `${process.env.TEMP}\\edge-halo-${PORT}-${Date.now()}`;
const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--enable-gpu-benchmarking', '--enable-threaded-compositing',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions',
  '--window-size=1500,1050', `--user-data-dir=${PROFILE}`, 'about:blank',
], { stdio: 'ignore' });
console.log(`browser pid ${browser.pid} (own process)`);

async function firstPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const ps = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((t) => t.type === 'page');
      if (ps.length) return ps[0];
    } catch {}
    await sleep(500);
  }
  throw new Error('no CDP page');
}
const target = await firstPage();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
const evaluate = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.text };
  return r.result?.result?.value;
};

await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.enable').catch(() => {});
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });

// What the carousel looks like in the SERVER HTML, before any JS runs.
const raw = await (await fetch(BASE + '/')).text();
const ssrCards = (raw.match(/class="[^"]*fan-card[^"]*"/g) || []).length;
const ssrInline = (raw.match(/fan-card[^>]*style="[^"]*"/g) || []).slice(0, 2);
console.log(`\nSSR HTML: ${ssrCards} .fan-card elements, inline transform styles on them: ${ssrInline.length}`);
console.log('  (no inline transform => every card is stacked dead centre at scale 1 until GSAP runs)');

const PROBE = `(() => {
  const cards = [...document.querySelectorAll('.fan-card')];
  if (!cards.length) return { n: 0 };
  // The active card is the largest one on screen.
  let best = null, bestArea = 0;
  for (const c of cards) {
    const r = c.getBoundingClientRect();
    const a = r.width * r.height;
    if (a > bestArea) { bestArea = a; best = c; }
  }
  const cs = getComputedStyle(best);
  const r = best.getBoundingClientRect();
  const base = parseFloat(cs.width);
  const m = new DOMMatrixReadOnly(cs.transform);
  return {
    n: cards.length,
    scale: +Math.sqrt(m.a * m.a + m.b * m.b).toFixed(3),
    cssWidth: base,
    paintedWidth: +r.width.toFixed(1),
    boxShadow: cs.boxShadow,
    willChange: cs.willChange,
    filter: cs.filter,
    backdropFilter: cs.backdropFilter,
    mixBlend: cs.mixBlendMode,
    perspective: getComputedStyle(best.parentElement).perspective,
    // PAGE coordinates, not viewport: Page.captureScreenshot's clip is in page
    // space, and the carousel sits well below the fold. Shooting the viewport
    // rect produced a blank white frame from the top of the document.
    rect: { x: Math.round(r.x), y: Math.round(r.y + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) },
  };
})()`;

/** The carousel is below the fold; the reader has to have scrolled to it. */
const BRING_INTO_VIEW = `(() => {
  const s = document.querySelector('#popular-products');
  if (!s) return false;
  s.scrollIntoView({ block: 'center', behavior: 'instant' });
  return Math.round(window.scrollY);
})()`;

await send('Page.navigate', { url: BASE + '/' });
const t0 = Date.now();
// As early as the section exists, so the timed shots below watch the card
// animate rather than watching an empty viewport.
for (let i = 0; i < 40; i++) {
  const y = await evaluate(BRING_INTO_VIEW);
  if (y !== false && y !== null) { console.log(`  scrolled carousel into view at y=${y}`); break; }
  await sleep(150);
}
let last = 0;
for (const at of SHOTS) {
  await sleep(Math.max(0, at - (Date.now() - t0)));
  const p = await evaluate(PROBE);
  if (!p || p.__error || !p.n) { console.log(`  ${at}ms: no cards yet (${p?.__error ?? 'none rendered'})`); continue; }
  // Frame the carousel: the card plus a generous margin so the halo is in shot.
  const pad = 180;
  const clip = {
    x: Math.max(0, p.rect.x - pad), y: Math.max(0, p.rect.y - pad),
    width: p.rect.w + pad * 2, height: p.rect.h + pad * 2, scale: 2,
  };
  const shot = await send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
  if (shot.result?.data) fs.writeFileSync(`${OUT}/halo-${at}ms.png`, Buffer.from(shot.result.data, 'base64'));
  console.log(`  ${String(at).padStart(5)}ms  cards ${p.n}  scale ${p.scale}  css ${p.cssWidth}px -> painted ${p.paintedWidth}px  will-change "${p.willChange}"`);
  if (at === SHOTS[0]) {
    console.log(`           box-shadow      ${p.boxShadow}`);
    console.log(`           filter          ${p.filter}`);
    console.log(`           backdrop-filter ${p.backdropFilter}`);
    console.log(`           mix-blend-mode  ${p.mixBlend}`);
    console.log(`           parent perspective ${p.perspective}`);
  }
  last = at;
}
console.log(`\nscreenshots in ${OUT}/ (2x device scale, card + 180px of surround)`);

ws.close();
try { process.kill(browser.pid); } catch {}
await sleep(700);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
