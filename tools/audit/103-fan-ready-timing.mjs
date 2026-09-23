import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

// Does the halo come back DURING the entrance animation?
//
//   node tools/audit/103-fan-ready-timing.mjs [baseUrl] [loads]
//
// .fan-ready is added at tween CREATION, not completion. At that instant
// gsap.set has just put every card at opacity 0, coincident at x=0 — so
// nothing is visible and nothing can compound. But the tweens then fade the
// cards in (delay 0.2 + slot*0.06, duration 1.2, elastic.out) while they are
// still near x=0, and by then all twenty have their shadow back. If several
// are visible before they separate, the halo returns, briefly.
//
// So this samples every frame in-page for FAN_WINDOW_MS (default 15s) — cheaper and far more accurate
// than 30 CDP round trips — and reports, per 100ms bucket:
//   ready     is .fan-ready set
//   vis       cards with opacity > 0.05
//   visShadow of those, how many carry a box-shadow
//   spreadX   standard deviation of visible card centres, in px. Small means
//             stacked; the fanned layout is a few hundred px.
// A frame is flagged when visShadow >= 2 and spreadX is small — that is the
// condition that produced the original halo.

const BASE = process.argv[2] ?? 'https://affhan.com';
const LOADS = Number(process.argv[3] ?? 3);
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9621);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Below this spread the visible cards are still on top of one another. */
const STACKED_PX = 60;

const PROFILE = `${process.env.TEMP}\\edge-ft-${PORT}-${Date.now()}`;
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

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.FAN_CPU ?? 4) });

const WINDOW_MS = Number(process.env.FAN_WINDOW_MS ?? 15000);

const INSTALL = `(() => {
  window.__fan = [];
  const t0 = performance.now();
  let scrolled = false;
  const tick = () => {
    const layout = document.querySelector('.fan-layout');
    if (layout && !scrolled) {
      const s = document.querySelector('#popular-products');
      if (s) { s.scrollIntoView({ block: 'center', behavior: 'instant' }); scrolled = true; }
    }
    if (layout) {
      const cards = [...layout.querySelectorAll('.fan-card')];
      let vis = 0, visShadow = 0;
      const xs = [];
      for (const c of cards) {
        const cs = getComputedStyle(c);
        const op = parseFloat(cs.opacity);
        if (!(op > 0.05)) continue;
        vis++;
        const r = c.getBoundingClientRect();
        xs.push(r.x + r.width / 2);
        if (cs.boxShadow && cs.boxShadow !== 'none') visShadow++;
      }
      let spread = 0;
      if (xs.length > 1) {
        const m = xs.reduce((a, b) => a + b, 0) / xs.length;
        spread = Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
      }
      window.__fan.push({
        t: Math.round(performance.now() - t0),
        ready: layout.classList.contains('fan-ready') ? 1 : 0,
        vis, visShadow, spread: Math.round(spread),
      });
    }
    if (performance.now() - t0 < ${WINDOW_MS}) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;

// Registered once, before any navigation: doing it inside the loop left the
// second and third loads with no sampler at all.
await send('Page.addScriptToEvaluateOnNewDocument', { source: INSTALL });

const BUCKET_MS = Number(process.env.FAN_BUCKET_MS ?? 500);
const all = [];
for (let load = 1; load <= LOADS; load++) {
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(400);
  await send('Page.navigate', { url: BASE + '/' });
  await sleep(WINDOW_MS + 1500);
  const rows = await evaluate('window.__fan');
  if (!rows || rows.__error || !rows.length) { console.log(`load ${load}: no samples (${rows?.__error})`); continue; }

  // One line per 100ms bucket, worst frame in the bucket.
  const buckets = new Map();
  for (const r of rows) {
    const b = Math.floor(r.t / BUCKET_MS) * BUCKET_MS;
    const cur = buckets.get(b);
    if (!cur || r.visShadow > cur.visShadow) buckets.set(b, r);
  }
  const readyAt = rows.find((r) => r.ready)?.t ?? null;
  const separatedAt = rows.find((r) => r.spread >= STACKED_PX)?.t ?? null;
  const risky = rows.filter((r) => r.visShadow >= 2 && r.spread < STACKED_PX);

  console.log(`\n=== load ${load}   frames ${rows.length}`);
  console.log(`  .fan-ready appears at   ${readyAt === null ? 'never in the window' : readyAt + 'ms'}`);
  console.log(`  cards visibly separate  ${separatedAt === null ? 'not in the window' : separatedAt + 'ms'}  (spread >= ${STACKED_PX}px)`);
  console.log(`  frames with >=2 visible shadowed cards while still stacked: ${risky.length}`);
  if (risky.length) {
    const worst = risky.reduce((a, b) => (b.visShadow > a.visShadow ? b : a));
    console.log(`     worst: t=${worst.t}ms  visible ${worst.vis}, of which shadowed ${worst.visShadow}, spread ${worst.spread}px`);
  }
  console.log(`  ${'t(ms)'.padStart(6)} ${'ready'.padStart(5)} ${'vis'.padStart(4)} ${'shadow'.padStart(6)} ${'spreadX'.padStart(7)}`);
  for (const b of [...buckets.keys()].sort((a, b) => a - b)) {
    const r = buckets.get(b);
    const flag = r.visShadow >= 2 && r.spread < STACKED_PX ? '  <-- stacked + shadowed' : '';
    console.log(`  ${String(b).padStart(6)} ${String(r.ready).padStart(5)} ${String(r.vis).padStart(4)} ${String(r.visShadow).padStart(6)} ${String(r.spread).padStart(7)}${flag}`);
  }
  all.push({ load, readyAt, separatedAt, risky: risky.length, rows });
}

fs.mkdirSync('tools/audit/wheel', { recursive: true });
fs.writeFileSync('tools/audit/wheel/fan-ready-timing.json', JSON.stringify(all, null, 2));
const totalRisky = all.reduce((s, a) => s + a.risky, 0);
console.log(`\nacross ${all.length} loads: ${totalRisky} frames with overlapping shadowed cards`);

ws.close();
try { process.kill(browser.pid); } catch {}
await sleep(700);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
