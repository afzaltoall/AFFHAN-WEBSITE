import 'dotenv/config';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

// How far does one real mouse-wheel notch move each page, and how far does the
// page keep gliding after the last notch?
//
//   node tools/audit/99-wheel-speed.mjs <label> <baseUrl> [--auto]
//
// WHY NOT Input.dispatchMouseEvent. Its wheel deltas are marked "precise".
// Chromium applies a precise delta in a single frame with no easing, so a
// harness built on it cannot see scroll FEEL at all — it reports the number it
// was given back to itself. The repo has been bitten by this once already
// (efbd39d): the regression it fixed shipped because every earlier wheel check
// used that API. So this drives chrome.gpuBenchmarking.smoothScrollBy with
// preciseScrollingDeltas = false and gestureSourceType = MOUSE_INPUT, which is
// a real notch: the compositor eases each one over ~175ms exactly as it does a
// physical wheel, and the page receives ordinary trusted wheel events.
//
// Needs a HEADED browser with --enable-gpu-benchmarking. Headless has no
// compositor easing, which is the thing being measured.
//
// --auto injects `html { scroll-behavior: auto !important }` as a stylesheet
// before scrolling. That is a browser-side override for the experiment; it
// changes no file on disk.
//
// Read-only against the site. Launches its own browser with its own profile
// and kills only that process id.

const LABEL = process.argv[2] ?? 'main';
const BASE = process.argv[3] ?? 'http://localhost:3000';
const FORCE_AUTO = process.argv.includes('--auto');

const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9611);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One notch is 100px on Windows; requesting 500 asks for five of them.
const NOTCH_PX = 100;
const NOTCHES = 5;
const GESTURE_PX = NOTCH_PX * NOTCHES;
const SPEED = 800;      // px/sec, a steady spin rather than a flick
const GLIDE_MS = 1600;  // how long to watch for movement after the gesture ends
const REPEATS = 3;

const PAGES = [
  ['/', 'home'],
  ['/sourcing-company-dubai/', 'dubai'],
  ['/shipping/', 'shipping'],
  ['/careers/', 'careers'],
  ['/admin/', 'admin'],
];

const SECRET = process.env.AUTH_SECRET || 'affhan_dev_secret';
const b64url = (i) => Buffer.from(i).toString('base64url');
const payload = b64url(JSON.stringify({
  id: 'probe-admin', email: process.env.ADMIN_EMAIL ?? 'admin@affhan.com',
  name: 'Probe', role: 'admin', iat: Date.now(),
}));
const token = `${payload}.${crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')}`;

const PROFILE = `${process.env.TEMP}\\edge-wheel-${PORT}-${Date.now()}`;
// HEADED on purpose. A window will open; it is this script's own browser,
// with its own profile directory, and only its pid is killed at the end.
const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`,
  '--enable-gpu-benchmarking',
  '--enable-threaded-compositing',
  '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-component-extensions-with-background-pages',
  '--window-size=1400,1000',
  `--user-data-dir=${PROFILE}`,
  'about:blank',
], { stdio: 'ignore' });
console.log(`browser pid ${browser.pid} (this script's own; nothing else is touched)`);

async function firstPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const pages = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json())
        .filter((t) => t.type === 'page');
      if (pages.length) return pages[0];
    } catch {}
    await sleep(500);
  }
  throw new Error('no CDP page');
}

const target = await firstPage();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) =>
  new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.text ?? 'exception' };
  return r.result?.result?.value;
};

await send('Network.enable');
await send('Page.enable');
await send('Runtime.enable');
await send('Network.setCookie', {
  name: 'affhan_session', value: token, domain: new URL(BASE).hostname, path: '/',
  httpOnly: true, secure: BASE.startsWith('https'), sameSite: 'Lax',
});

// One run: park at the top, fire five real notches, then watch for glide.
const RUN = `(async () => {
  const gb = chrome && chrome.gpuBenchmarking;
  if (!gb || !gb.smoothScrollBy) return { __error: 'gpuBenchmarking unavailable' };

  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 450));
  const before = window.scrollY;

  // Chromium's signature, in order:
  //   pixels, callback, start_x, start_y, gesture_source_type, direction,
  //   speed_in_pixels_s, precise_scrolling_deltas, ...
  // direction is a STRING and sits at index 5; passing the speed there is a
  // conversion failure, which is how the first run of this harness failed.
  const duringEnd = await new Promise((resolve) => {
    gb.smoothScrollBy(
      ${GESTURE_PX},
      () => resolve(window.scrollY),
      10, 10,                       // gesture origin
      gb.MOUSE_INPUT,
      'down',
      ${SPEED},
      false                         // preciseScrollingDeltas: false -> real notches
    );
  });

  // Whatever the page adds after the last notch: compositor easing, a smooth
  // scroll animation, or a smooth-scroll library still running.
  const settle = async () => {
    let last = window.scrollY, still = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < ${GLIDE_MS}) {
      await new Promise((r) => requestAnimationFrame(r));
      const y = window.scrollY;
      if (y === last) { if (++still > 12) break; } else { still = 0; last = y; }
    }
    return last;
  };
  const after = await settle();

  return {
    before,
    duringEnd,
    after,
    total: after - before,
    glide: after - duringEnd,
    height: document.documentElement.scrollHeight,
    behavior: getComputedStyle(document.documentElement).scrollBehavior,
    lenis: Boolean(window.lenis),
  };
})()`;

const AUTO_CSS = `(() => {
  const s = document.createElement('style');
  s.id = 'probe-scroll-auto';
  s.textContent = 'html{scroll-behavior:auto !important}';
  document.head.appendChild(s);
  return getComputedStyle(document.documentElement).scrollBehavior;
})()`;

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

console.log(`\nstate: ${LABEL}   base: ${BASE}   forceAuto: ${FORCE_AUTO}`);
console.log(`gesture: ${NOTCHES} notches x ${NOTCH_PX}px at ${SPEED}px/s, non-precise, MOUSE_INPUT\n`);
console.log(`  ${'page'.padEnd(10)} ${'behavior'.padEnd(9)} ${'lenis'.padEnd(6)} ${'px/notch'.padStart(9)} ${'glide px'.padStart(9)} ${'total'.padStart(7)}  height`);

const out = [];
for (const [path, name] of PAGES) {
  await send('Page.navigate', { url: BASE + path });
  // Dev server compiles on demand; give the first paint room, then settle.
  await sleep(path === '/' ? 9000 : 7000);
  if (FORCE_AUTO) await evaluate(AUTO_CSS);

  const runs = [];
  for (let i = 0; i < REPEATS; i++) {
    const r = await evaluate(RUN);
    if (r && r.__error) { console.log(`  ${name.padEnd(10)} ERROR ${r.__error}`); break; }
    if (r) runs.push(r);
    await sleep(500);
  }
  if (!runs.length) { out.push({ name, error: true }); continue; }

  const perNotch = median(runs.map((r) => r.total / NOTCHES));
  const glide = median(runs.map((r) => r.glide));
  const total = median(runs.map((r) => r.total));
  const row = {
    state: LABEL, page: name, perNotch: +perNotch.toFixed(1), glide: +glide.toFixed(1),
    total: +total.toFixed(1), behavior: runs[0].behavior, lenis: runs[0].lenis, height: runs[0].height,
  };
  out.push(row);
  console.log(`  ${name.padEnd(10)} ${String(row.behavior).padEnd(9)} ${String(row.lenis).padEnd(6)} ` +
    `${String(row.perNotch).padStart(9)} ${String(row.glide).padStart(9)} ${String(row.total).padStart(7)}  ${row.height}`);
}

fs.mkdirSync('tools/audit/wheel', { recursive: true });
fs.writeFileSync(`tools/audit/wheel/${LABEL}.json`, JSON.stringify(out, null, 2));
console.log(`\nwritten: tools/audit/wheel/${LABEL}.json`);

ws.close();
// Only this script's own browser, by the pid spawn handed back.
try { process.kill(browser.pid); } catch {}
await sleep(800);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
