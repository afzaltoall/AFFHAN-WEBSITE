import { spawn } from 'node:child_process';

// Every LCP candidate, in order, with what replaced it.
//
//   node tools/audit/60-lcp-candidates.mjs <url>
//
// Lighthouse reports one LCP number. It does not say how many candidates came
// before it, which is the thing that matters here: all three homepage sections
// re-pick their products in a layout effect after hydration, so the images the
// server rendered are swapped for different ones. If that swap moves LCP, it
// shows up as a late candidate whose URL is absent from the SSR HTML.
//
// heroPool.ts records an earlier attempt at this theory that measured as noise,
// so this records the mechanism directly rather than inferring it from a timing
// difference: candidate list, hydration mark, and image request count vs the
// number of images actually left in the DOM.

const url = process.argv[2] ?? 'https://affhan.com/';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9443);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-lc-${Date.now()}`, 'about:blank',
], { stdio: 'ignore' });

async function firstPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const p = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((t) => t.type === 'page');
      if (p.length) return p[0];
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
const imgReqs = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Network.requestWillBeSent' && m.params.type === 'Image') {
    imgReqs.push({ url: m.params.request.url, t: m.params.timestamp });
  }
};
const send = (m, p = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method: m, params: p })); });

await send('Page.enable');
await send('Network.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });
// Lighthouse mobile throttling: ~1.6 Mbps down, 150ms RTT.
await send('Network.emulateNetworkConditions', {
  offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
});

// Install the observer before any navigation commits.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__lcp = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        window.__lcp.push({ t: Math.round(e.startTime), size: e.size, url: e.url || '(text)',
                            tag: e.element ? e.element.tagName : '?',
                            cls: e.element ? String(e.element.className).slice(0, 50) : '' });
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  `,
});

// What the server actually sent, before any script runs.
const ssr = await (await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/120 Mobile' } })).text();
const ssrImgs = new Set([...ssr.matchAll(/https:\/\/daje3fmp2npne\.cloudfront\.net\/[^"'\ )]+/g)].map((m) => m[0].split('?')[0]));

await send('Page.navigate', { url });
await sleep(25000);

const r = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `({
    lcp: window.__lcp,
    domImgs: [...document.images].map(i => i.currentSrc || i.src),
  })`,
});
const v = r.result?.result?.value ?? {};
const lcp = v.lcp ?? [];

console.log(`LCP CANDIDATES on ${url}  (4x CPU, 1.6Mbps/150ms)\n`);
console.log('  #   at ms     size        tag  in SSR HTML?  url tail');
console.log('  ' + '-'.repeat(82));
lcp.forEach((c, i) => {
  const bare = (c.url || '').split('?')[0];
  const inSsr = c.url ? (ssrImgs.has(bare) ? 'YES' : 'NO  <<<') : '-';
  console.log(
    '  ' + String(i + 1).padStart(2) + String(c.t).padStart(9) + String(c.size).padStart(10) +
    '   ' + c.tag.padEnd(5) + inSsr.padEnd(13) + (c.url ? bare.slice(-46) : c.cls.slice(0, 46))
  );
});

const cdnReqs = imgReqs.filter((r) => r.url.includes('cloudfront') || r.url.includes('/_next/image'));
const uniqReq = new Set(cdnReqs.map((r) => r.url.split('?')[0]));
const domUniq = new Set((v.domImgs ?? []).map((u) => u.split('?')[0]));
console.log(`\nSSR HTML contained          ${ssrImgs.size} distinct CDN image urls`);
console.log(`Browser requested           ${cdnReqs.length} images (${uniqReq.size} distinct)`);
console.log(`DOM ended up with           ${(v.domImgs ?? []).length} images (${domUniq.size} distinct)`);
const wasted = [...uniqReq].filter((u) => !domUniq.has(u)).length;
console.log(`Requested but NOT in final DOM: ${wasted}   <- fetched, decoded, then discarded`);

ws.close();
browser.kill();
