import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

// Would preload="none"/"metadata" plus a lazy src break or delay the careers
// scroll-scrub?
//
//   node tools/audit/113-video-preload-probe.mjs [baseUrl]
//
// REPORT ONLY: this changes no file. Both variants are produced at runtime
// over CDP by setting properties on the existing <video>, so the page on disk
// is exactly what is committed.
//
//   baseline  the page as shipped: preload="auto", sources present from the
//             first parse.
//   lazy      preload set to "none" and the <source> children detached before
//             the media loader can start, then re-attached at the moment the
//             hero scrolls into view — which is what an IntersectionObserver
//             implementation would do.
//
// What is measured, from the moment the hero is reached: how long until the
// element can actually be scrubbed. readyState >= 2 (HAVE_CURRENT_DATA) is
// the point a frame exists to show; a seek is then issued and the time to the
// 'seeked' event is recorded, because that is the thing the reader feels.
// The file is all-intra (see 112-webm-keyframes.mjs), so a seek needs no
// preceding keyframe — only the bytes for the one frame.

const BASE = process.argv[2] ?? 'http://localhost:3000';
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9641);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CPU = Number(process.env.VID_CPU ?? 4);

const PROFILE = `${process.env.TEMP}\\edge-vid-${PORT}-${Date.now()}`;
const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--disable-gpu',
  '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${PROFILE}`, 'about:blank',
], { stdio: 'ignore' });

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

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');

// Detach the sources as early as the element exists, before the loader runs.
const MAKE_LAZY = `(() => {
  window.__lazy = { detached: false, html: '' };
  const strip = () => {
    const v = document.querySelector('video');
    if (!v || window.__lazy.detached) return;
    window.__lazy.html = v.innerHTML;
    v.preload = 'none';
    v.innerHTML = '';
    v.removeAttribute('src');
    v.load();
    window.__lazy.detached = true;
  };
  strip();
  new MutationObserver(strip).observe(document.documentElement, { childList: true, subtree: true });
  return true;
})()`;

const MEASURE = `(async (lazy) => {
  const v = document.querySelector('video');
  if (!v) return { error: 'no video element' };
  const hero = document.querySelector('video')?.closest('section') || document.body;
  hero.scrollIntoView({ block: 'center', behavior: 'instant' });

  const t0 = performance.now();
  if (lazy && window.__lazy?.detached) {
    v.innerHTML = window.__lazy.html;   // what an IntersectionObserver would do
    v.preload = 'auto';
    v.load();
  }

  const ready = await new Promise((resolve) => {
    const done = () => resolve(performance.now() - t0);
    if (v.readyState >= 2) return done();
    const onCan = () => { v.removeEventListener('loadeddata', onCan); done(); };
    v.addEventListener('loadeddata', onCan);
    setTimeout(() => resolve(-1), 20000);
  });

  let seeked = -1;
  if (ready >= 0) {
    const t1 = performance.now();
    seeked = await new Promise((resolve) => {
      const onSeeked = () => { v.removeEventListener('seeked', onSeeked); resolve(performance.now() - t1); };
      v.addEventListener('seeked', onSeeked);
      try { v.currentTime = Math.min(5, (v.duration || 10) * 0.5); } catch { resolve(-1); }
      setTimeout(() => resolve(-1), 15000);
    });
  }
  return { ready: Math.round(ready), seeked: Math.round(seeked), duration: v.duration, readyState: v.readyState, wasDetached: Boolean(window.__lazy?.detached) };
})(__LAZY__)`;

async function run(label, width, lazy) {
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 500 ? 780 : 900, deviceScaleFactor: 1, mobile: width < 500 });
  await send('Emulation.setCPUThrottlingRate', { rate: CPU });
  // 4G-ish. Without this the file arrives instantly from disk and the whole
  // question — does lazy loading delay the scrub — has no measurable answer.
  await send('Network.emulateNetworkConditions', {
    offline: false, latency: 70, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (1024 * 1024) / 8,
  });
  if (lazy) await send('Page.addScriptToEvaluateOnNewDocument', { source: MAKE_LAZY });
  await send('Page.navigate', { url: BASE + '/careers/' });
  await sleep(Number(process.env.VID_WAIT_MS ?? 3000));
  const r = await evaluate(MEASURE.replace('__LAZY__', String(lazy)));
  if (r?.__error || r?.error) console.log(`  ${label.padEnd(26)} ERROR ${r.__error ?? r.error}`);
  else console.log(`  ${label.padEnd(26)} ready ${String(r?.ready ?? '?').padStart(6)}ms   first seek ${String(r?.seeked ?? '?').padStart(5)}ms   readyState ${r?.readyState ?? '?'}   lazy-strip-held ${r?.wasDetached ?? 'n/a'}`);
  return r;
}

console.log(`\n=== careers scrub, CPU ${CPU}x, ${BASE}\n`);
console.log('  "ready" is from reaching the hero to a first frame being available.');
console.log('  "first seek" is a scrub to the midpoint, measured to the seeked event.\n');

const out = {};
out.desktopBaseline = await run('1440 baseline (preload auto)', 1440, false);
out.mobileBaseline = await run(' 390 baseline (preload auto)', 390, false);
// A fresh target for the lazy variants so the injected script only affects them.
out.desktopLazy = await run('1440 lazy (preload none)', 1440, true);
out.mobileLazy = await run(' 390 lazy (preload none)', 390, true);

fs.mkdirSync('tools/audit/seo', { recursive: true });
fs.writeFileSync('tools/audit/seo/video-preload.json', JSON.stringify(out, null, 2));
console.log('\n  written: tools/audit/seo/video-preload.json');

ws.close();
try { process.kill(browser.pid); } catch {}
await sleep(700);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
