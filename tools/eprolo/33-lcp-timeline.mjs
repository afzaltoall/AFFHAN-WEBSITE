import { spawn } from 'node:child_process';
import fs from 'node:fs';

// Why the same page measures 1.3s on one run and 15.8s on the next.
//
//   THROTTLE=1 node tools/eprolo/33-lcp-timeline.mjs [url]
//
// 26-lcp-probe.mjs reports only the final LCP. That hid a bimodal result on the
// homepage, so this one records every candidate the observer sees, with its
// pixel area, plus what the viewport looked like and how far down the page the
// winning element sits. A candidate list makes the difference between "the
// network was slow" and "a different element won" impossible to confuse.

const URL_ARG = process.argv[2] ?? 'http://localhost:3000/';
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9430);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A fresh profile per invocation.
//
// This is not housekeeping — it is the measurement. The first version reused
// one profile per port, so Edge kept the product images on disk between runs
// and a variant that happened to run second measured three times faster than
// the control for no reason but a warm cache. LCP here is a first-visit
// number, so every run starts cold.
const PROFILE = `${process.env.TEMP}\\edge-tl-${PORT}-${Date.now()}`;

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--disable-gpu',
  '--disable-extensions', '--disable-component-extensions-with-background-pages',
  `--user-data-dir=${PROFILE}`, 'about:blank',
], { stdio: 'ignore' });

async function firstPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const pages = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((t) => t.type === 'page');
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
const images = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Network.responseReceived' && /image\//.test(m.params.response.mimeType || '')) {
    images.push({ t: Date.now(), url: m.params.response.url });
  }
};
const send = (method, params = {}) =>
  new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

await send('Network.enable');
await send('Page.enable');
await send('Runtime.enable');

await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__cands = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const el = e.element;
        const r = el ? el.getBoundingClientRect() : null;
        window.__cands.push({
          t: Math.round(e.startTime),
          area: e.size,
          tag: el ? el.tagName : '(none)',
          cls: el ? String(el.className).split(' ').slice(0,2).join('.') : '',
          url: (e.url || '').slice(-46),
          top: r ? Math.round(r.top + window.scrollY) : null,
          w: r ? Math.round(r.width) : null,
          h: r ? Math.round(r.height) : null,
        });
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  `,
});

if (process.env.THROTTLE) {
  await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8,
  });
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
}

// Belt and braces: a fresh profile should already be empty, but Edge can carry
// state in from a component update or a preinstalled origin.
await send('Network.clearBrowserCache');
await send('Network.clearBrowserCookies');

// BLOCK_CDN_IMAGES=1 drops every product photo.
//
// The homepage ships ~150 supplier originals totalling 11.5 MB, which is about
// a minute of download on the emulated connection, and which of them lands in
// the LCP slot is re-randomised at every ISR regeneration. That noise is far
// larger than anything a JS-chunk or payload change could do, so it has to be
// removed before those changes can be measured at all. The resulting number is
// not a real-world LCP — it is the page's floor with its images taken away.
if (process.env.BLOCK_CDN_IMAGES) {
  await send('Network.setBlockedURLs', { urls: ['*d294cbym1d7nev.cloudfront.net*'] });
}

const t0 = Date.now();
await send('Page.navigate', { url: URL_ARG });
await sleep(32000);

const r = await send('Runtime.evaluate', {
  expression: `(() => ({
    cands: window.__cands,
    vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio,
    scrollY: window.scrollY,
    // Every image whose box overlaps the first viewport, whether painted or not.
    aboveFold: [...document.querySelectorAll('img')].filter(i => {
      const b = i.getBoundingClientRect();
      return b.top < innerHeight && b.bottom > 0 && b.width > 0;
    }).map(i => ({ w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height), complete: i.complete, lazy: i.loading, op: getComputedStyle(i).opacity, src: i.currentSrc.slice(-40) })),
  }))()`,
  returnByValue: true,
});
const v = r.result?.result?.value ?? {};

console.log(`\n=== ${URL_ARG}  (throttled=${!!process.env.THROTTLE}) ===`);
console.log(`viewport ${v.vw}x${v.vh} @${v.dpr}x   scrollY ${v.scrollY}`);
console.log(`\nLCP candidates in order (the last one is the reported LCP):`);
for (const c of v.cands ?? []) {
  console.log(`  ${String((c.t / 1000).toFixed(2)).padStart(6)}s  area ${String(c.area).padStart(7)}px²  ${c.tag}.${c.cls}  ${c.w}x${c.h} @y=${c.top}  ${c.url}`);
}
console.log(`\nimages overlapping the first viewport: ${(v.aboveFold ?? []).length}`);
for (const i of (v.aboveFold ?? []).slice(0, 12)) {
  console.log(`  ${i.w}x${i.h}  complete=${i.complete}  loading=${i.lazy || '(none)'}  opacity=${i.op}  ${i.src}`);
}
console.log(`\nimage responses over the run: ${images.length}`);
if (images.length) {
  console.log(`  first at ${((images[0].t - t0) / 1000).toFixed(2)}s, last at ${((images[images.length - 1].t - t0) / 1000).toFixed(2)}s`);
}


// One machine-readable line so 32-lcp-variant.mjs can drive this script.
//
// finalIsImage matters as much as the number: a run where a text node is still
// the largest paint has not loaded its above-the-fold product image at all, so
// its low LCP is an unfinished measurement rather than a fast page.
const cands = v.cands ?? [];
const last = cands[cands.length - 1];
console.log(`SUMMARY lcp=${last ? (last.t / 1000).toFixed(2) : "0"} tag=${last?.tag ?? "none"} area=${last?.area ?? 0} imgs=${images.length} finalIsImage=${last?.tag === "IMG"}`);

ws.close();
browser.kill();
await sleep(600);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
