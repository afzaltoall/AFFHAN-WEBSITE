import { spawn } from 'node:child_process';

// Measures LCP the way DevTools does — PerformanceObserver on
// 'largest-contentful-paint' in a real browser — and reports which element won,
// how many images are in the document, and how many image requests were made.
//
//   node tools/eprolo/26-lcp-probe.mjs <url> [label]
//
// The counts matter as much as the number: an LCP that keeps moving is usually
// an element being replaced after hydration, not a slow network.

const URL_ARG = process.argv[2] ?? 'http://localhost:3000/';
const LABEL = process.argv[3] ?? URL_ARG;
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9401);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--disable-gpu',
  `--user-data-dir=${process.env.TEMP}\\edge-lcp-${PORT}`, 'about:blank',
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
let imageRequests = 0;
const slowImages = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Network.responseReceived' && /image\//.test(m.params.response.mimeType || '')) {
    imageRequests++;
  }
};
const send = (method, params = {}) =>
  new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

await send('Network.enable');
await send('Page.enable');
await send('Runtime.enable');

// Install the observer before navigating so nothing is missed.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__lcp = { value: 0, element: '', changes: 0 };
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__lcp.value = e.startTime;
        window.__lcp.changes++;
        const el = e.element;
        window.__lcp.element = el ? (el.tagName + '.' + String(el.className).split(' ').slice(0,3).join('.')) : '(none)';
        window.__lcp.url = e.url || '';
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  `,
});

if (process.env.THROTTLE) {
  // Reproduce a DevTools mobile profile: 4x CPU slowdown and Slow 4G.
  await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8,
  });
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 2, mobile: true });
}
await send('Page.navigate', { url: URL_ARG });
await sleep(32000); // long enough to see a 30s LCP settle

const r = await send('Runtime.evaluate', {
  expression: `(() => ({
    lcp: window.__lcp,
    imgsInDom: document.querySelectorAll('img').length,
    productLinks: document.querySelectorAll('a[aria-label]').length,
    categoryTiles: document.querySelectorAll('a[href*="categoryId="]').length,
  }))()`,
  returnByValue: true,
});
const v = r.result?.result?.value ?? {};

console.log(`\n=== ${LABEL} ===`);
console.log(`  LCP              : ${(v.lcp?.value / 1000).toFixed(2)}s`);
console.log(`  LCP element      : ${v.lcp?.element || '(none)'}`);
console.log(`  LCP url          : ${(v.lcp?.url || '(none)').slice(-72)}`);
console.log(`  LCP candidates   : ${v.lcp?.changes} (how many times the LCP element changed)`);
console.log(`  <img> in DOM     : ${v.imgsInDom}`);
console.log(`  product links    : ${v.productLinks}`);
console.log(`  category tiles   : ${v.categoryTiles}`);
console.log(`  image responses  : ${imageRequests}`);

ws.close();
browser.kill();
