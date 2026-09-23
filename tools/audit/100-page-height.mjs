import 'dotenv/config';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

// Perceived scroll speed: is the page simply SHORTER than it was?
//
//   node tools/audit/100-page-height.mjs <label> <baseUrl>
//
// A wheel notch moves a fixed number of pixels. If the document is a third of
// its former length, the same notch covers three times as much of it, and the
// page reads as "too fast" while being pixel-identical — which is exactly what
// 99-wheel-speed.mjs found: 500px in, 500px out, on every page, in every state.
//
// Three measurements:
//   HEIGHTS   document.scrollHeight at 1440 / 768 / 440, five pages.
//   STABILITY / stepped top to bottom, recording scrollHeight and scrollTop
//             after each step, plus cumulative layout shift. content-visibility
//             with contain-intrinsic-size is the suspect: the browser guesses
//             each tile's height and corrects it on approach, which moves the
//             scrollbar under the reader.
//   TOUCH     a real fling via gpuBenchmarking TOUCH_INPUT, distance and glide.
//
// Headed, because momentum and compositor easing do not exist headless.
// Read-only: it navigates, resizes and scrolls. It changes nothing.

const LABEL = process.argv[2] ?? 'main';
const BASE = process.argv[3] ?? 'http://localhost:3101';
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9615);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = [
  ['/', 'home'],
  ['/sourcing-company-dubai/', 'dubai'],
  ['/shipping/', 'shipping'],
  ['/careers/', 'careers'],
  ['/china-sourcing-company/', 'china'],
];
const WIDTHS = [1440, 768, 440];
/** An error/404 page is ~860px tall; anything at or under this is not a measurement. */
const ERROR_HEIGHT = 1000;

const SECRET = process.env.AUTH_SECRET || 'affhan_dev_secret';
const b64url = (i) => Buffer.from(i).toString('base64url');
const payload = b64url(JSON.stringify({
  id: 'probe-admin', email: process.env.ADMIN_EMAIL ?? 'admin@affhan.com',
  name: 'Probe', role: 'admin', iat: Date.now(),
}));
const token = `${payload}.${crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')}`;

const PROFILE = `${process.env.TEMP}\\edge-h-${PORT}-${Date.now()}`;
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
const metrics = (width, mobile = false) => send('Emulation.setDeviceMetricsOverride', {
  width, height: mobile ? 900 : 1000, deviceScaleFactor: 1, mobile,
  ...(mobile ? { screenWidth: width, screenHeight: 900 } : {}),
});

await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable');
await send('Network.setCookie', {
  name: 'affhan_session', value: token, domain: new URL(BASE).hostname, path: '/',
  httpOnly: true, secure: false, sameSite: 'Lax',
});

const result = { label: LABEL, heights: [], stability: [], touch: [] };

// ---------------------------------------------------------------- 1. heights
console.log(`\n=== HEIGHTS  (${LABEL})\n`);
console.log(`  ${'page'.padEnd(10)} ${'1440'.padStart(9)} ${'768'.padStart(9)} ${'440'.padStart(9)}   tiles@1440`);
for (const [path, name] of PAGES) {
  const row = { page: name };
  for (const w of WIDTHS) {
    await metrics(w);
    await send('Page.navigate', { url: BASE + path });
    await sleep(name === 'home' ? 11000 : 8000);
    const v = await evaluate(`(() => ({
      h: document.documentElement.scrollHeight,
      tiles: document.querySelectorAll('#product-categories .liquid-glass-card').length,
      title: document.title,
    }))()`);
    row[w] = v?.h ?? 0;
    if (w === 1440) row.tiles = v?.tiles ?? 0;
  }
  result.heights.push(row);
  const fmt = (n) => (n && n > ERROR_HEIGHT ? String(n) : `n/a(${n})`);
  console.log(`  ${name.padEnd(10)} ${fmt(row[1440]).padStart(9)} ${fmt(row[768]).padStart(9)} ${fmt(row[440]).padStart(9)}   ${row.tiles}`);
}

// ------------------------------------------------------------- 2. stability
// Stepping down the homepage, watching for the document changing length under
// the reader or the scroll position being corrected.
const STEP_SCRIPT = `(async () => {
  let cls = 0;
  const po = new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) cls += e.value;
  });
  try { po.observe({ type: 'layout-shift', buffered: true }); } catch {}

  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 600));
  const steps = [];
  const vh = window.innerHeight;
  let prevH = document.documentElement.scrollHeight;
  for (let i = 1; i <= 14; i++) {
    const want = Math.round(vh * 0.9 * i);
    window.scrollTo(0, want);
    await new Promise((r) => setTimeout(r, 420));
    const h = document.documentElement.scrollHeight;
    const y = Math.round(window.scrollY);
    steps.push({ i, want, got: y, drift: y - want, h, dh: h - prevH });
    prevH = h;
    if (y + vh >= h - 2) break;
  }
  po.disconnect();
  return { steps, cls: +cls.toFixed(4), finalH: document.documentElement.scrollHeight };
})()`;

console.log(`\n=== STABILITY on / while stepping down  (${LABEL})\n`);
for (const w of [1440, 440]) {
  await metrics(w);
  await send('Page.navigate', { url: BASE + '/' });
  await sleep(11000);
  const s = await evaluate(STEP_SCRIPT);
  if (!s || s.__error) { console.log(`  ${w}px: ERROR ${s?.__error}`); continue; }
  const jumps = s.steps.filter((x) => Math.abs(x.dh) > 50);
  const drifts = s.steps.filter((x) => Math.abs(x.drift) > 4);
  result.stability.push({ width: w, cls: s.cls, finalH: s.finalH, steps: s.steps, jumps: jumps.length, drifts: drifts.length });
  console.log(`  ${w}px  CLS ${s.cls}   final height ${s.finalH}   scrollHeight changes >50px: ${jumps.length}   scrollTop drift >4px: ${drifts.length}`);
  for (const j of jumps) console.log(`      step ${j.i}: height ${j.h - j.dh} -> ${j.h}  (${j.dh > 0 ? '+' : ''}${j.dh})`);
  for (const d of drifts.slice(0, 5)) console.log(`      step ${d.i}: asked ${d.want}, landed ${d.got} (${d.drift > 0 ? '+' : ''}${d.drift})`);
}

// ----------------------------------------------------------------- 3. touch
const FLING = `(async () => {
  const gb = chrome.gpuBenchmarking;
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 500));
  const before = window.scrollY;
  const atEnd = await Promise.race([
    new Promise((resolve) => {
      gb.smoothScrollBy(400, () => resolve(window.scrollY), 200, 400, gb.TOUCH_INPUT, 'down', 1200);
    }),
    new Promise((resolve) => setTimeout(() => resolve(window.scrollY), 5000)),
  ]);
  // Momentum keeps running after the finger lifts.
  let last = window.scrollY, still = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 2500) {
    await new Promise((r) => requestAnimationFrame(r));
    const y = window.scrollY;
    if (y === last) { if (++still > 15) break; } else { still = 0; last = y; }
  }
  return { before, atEnd, after: last, total: last - before, glide: last - atEnd,
           h: document.documentElement.scrollHeight, vh: window.innerHeight };
})()`;

console.log(`\n=== TOUCH fling on / at 440px, mobile emulation  (${LABEL})\n`);
await metrics(440, true);
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.navigate', { url: BASE + '/' });
await sleep(11000);
const runs = [];
for (let i = 0; i < 3; i++) {
  const t = await evaluate(FLING);
  if (t && !t.__error) runs.push(t);
  await sleep(700);
}
if (runs.length) {
  const med = (f) => [...runs.map(f)].sort((a, b) => a - b)[Math.floor(runs.length / 2)];
  const row = { total: med((r) => r.total), glide: med((r) => r.glide), h: runs[0].h, vh: runs[0].vh };
  row.screensPerFling = +(row.total / row.vh).toFixed(2);
  row.pctOfPage = +((row.total / row.h) * 100).toFixed(2);
  result.touch.push(row);
  console.log(`  400px swipe -> ${row.total}px total, ${row.glide}px of momentum`);
  console.log(`  that is ${row.screensPerFling} screens, and ${row.pctOfPage}% of a ${row.h}px page`);
} else {
  console.log('  no usable runs');
}

fs.mkdirSync('tools/audit/wheel', { recursive: true });
fs.writeFileSync(`tools/audit/wheel/height-${LABEL}.json`, JSON.stringify(result, null, 2));
console.log(`\nwritten: tools/audit/wheel/height-${LABEL}.json`);

ws.close();
try { process.kill(browser.pid); } catch {}
await sleep(800);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
