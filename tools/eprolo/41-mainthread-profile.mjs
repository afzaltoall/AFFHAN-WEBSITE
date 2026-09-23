import { spawn } from 'node:child_process';
import fs from 'node:fs';

// Where the main thread goes, and who is sending the bytes.
//
//   node tools/eprolo/41-mainthread-profile.mjs [url]
//
// GTmetrix reports TBT 468ms, "2.0s spent executing JavaScript" and "third-party
// code: 743KB" without saying which scripts. This attributes both: bytes by
// origin, and long tasks (>50ms) with the total blocking time they contribute,
// measured the way Lighthouse measures it — 4x CPU throttling, which is what
// makes a task long enough to count in the first place.

const URL_ARG = process.argv[2] ?? 'https://affhan.com/';
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PROFILE = `${process.env.TEMP}\\edge-mt-${PORT}-${Date.now()}`;
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
const responses = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Network.responseReceived') {
    responses.push({ url: m.params.response.url, type: m.params.type, mime: m.params.response.mimeType, id: m.params.requestId });
  }
  if (m.method === 'Network.loadingFinished') {
    const r = responses.find((x) => x.id === m.params.requestId);
    if (r) r.bytes = m.params.encodedDataLength;
  }
};
const send = (method, params = {}) =>
  new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await send('Network.enable');
await send('Page.enable');
await send('Runtime.enable');

await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__long = [];
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          window.__long.push({ start: Math.round(e.startTime), dur: Math.round(e.duration),
            attribution: (e.attribution || []).map(a => (a.name || '') + ':' + (a.containerType || '')).join(',') });
        }
      }).observe({ type: 'longtask', buffered: true });
    } catch {}
  `,
});

// Lighthouse's own throttling. Without it no task is long and TBT reads zero.
await send('Emulation.setCPUThrottlingRate', { rate: 4 });

await send('Page.navigate', { url: URL_ARG });
await sleep(25000);

const v = await evaluate(`(() => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  return {
    long: window.__long || [],
    fcp: Math.round((performance.getEntriesByName('first-contentful-paint')[0]||{}).startTime || 0),
    domNodes: document.getElementsByTagName('*').length,
    domDepth: (() => { let max = 0; const walk = (n, d) => { max = Math.max(max, d); for (const c of n.children) walk(c, d + 1); }; walk(document.body, 0); return max; })(),
    scripts: document.querySelectorAll('script[src]').length,
    inlineScripts: document.querySelectorAll('script:not([src])').length,
    imgs: document.querySelectorAll('img').length,
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
    load: Math.round(nav.loadEventEnd || 0),
  };
})()`);

const page = new URL(URL_ARG);
const byOrigin = new Map();
for (const r of responses) {
  if (!r.bytes) continue;
  let host;
  try { host = new URL(r.url).host; } catch { continue; }
  const key = host === page.host ? `${host} (first party)` : host;
  const cur = byOrigin.get(key) ?? { bytes: 0, n: 0, js: 0 };
  cur.bytes += r.bytes; cur.n++;
  if (r.type === 'Script') cur.js += r.bytes;
  byOrigin.set(key, cur);
}

const kb = (b) => (b / 1024).toFixed(0).padStart(6) + ' KB';
console.log(`\n=== ${URL_ARG} (4x CPU throttle) ===`);
console.log(`\nbytes by origin:`);
for (const [host, s] of [...byOrigin.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) {
  console.log(`  ${kb(s.bytes)}  ${String(s.n).padStart(4)} req  (js ${kb(s.js)})  ${host}`);
}

const scripts = responses.filter((r) => r.type === 'Script' && r.bytes).sort((a, b) => b.bytes - a.bytes);
console.log(`\nheaviest scripts (${scripts.length} total, ${kb(scripts.reduce((s, r) => s + r.bytes, 0))}):`);
for (const s of scripts.slice(0, 15)) console.log(`  ${kb(s.bytes)}  ${s.url.replace(page.origin, '').slice(0, 80)}`);

// TBT is the part of each long task beyond 50ms, summed between FCP and TTI.
const long = v.long ?? [];
const afterFcp = long.filter((t) => t.start >= (v.fcp || 0));
const tbt = afterFcp.reduce((s, t) => s + Math.max(0, t.dur - 50), 0);
console.log(`\nlong tasks (>50ms): ${long.length}   after FCP: ${afterFcp.length}`);
console.log(`approx TBT contribution: ${tbt}ms`);
console.log(`  longest:`);
for (const t of [...long].sort((a, b) => b.dur - a.dur).slice(0, 10)) {
  console.log(`    ${String(t.dur).padStart(5)}ms at ${String(t.start).padStart(6)}ms  ${t.attribution || ''}`);
}

console.log(`\nFCP ${v.fcp}ms   DOMContentLoaded ${v.domContentLoaded}ms   load ${v.load}ms`);
console.log(`DOM nodes ${v.domNodes} (depth ${v.domDepth})   <script src> ${v.scripts}   inline <script> ${v.inlineScripts}   <img> ${v.imgs}`);

ws.close();
browser.kill();
await sleep(600);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
