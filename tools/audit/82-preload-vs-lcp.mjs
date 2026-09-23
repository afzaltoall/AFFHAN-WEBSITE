import { spawn } from 'node:child_process';

// Is the preloaded image the one LCP actually measures, and does the preload
// win it any priority?
//
//   node tools/audit/82-preload-vs-lcp.mjs <url>
//
// 81-critical-path found the LCP image requested at Low priority by the
// parser, finishing at 2,790ms for 46 kB on a link that should carry it in
// ~230ms. The HTML does contain <link rel=preload as=image> for a 400px
// product image, and contains no fetchpriority attribute anywhere.
//
// Those two facts only reconcile one of two ways: the preload names a
// different image than the one that ends up largest, or the preload is not
// buying any priority. This decodes the Serverless Image Handler keys on both
// sides so they can be compared by name rather than by base64 tail, which is
// nearly identical across every image.

const url = process.argv[2] ?? 'https://affhan.com/';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9473);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const decodeKey = (u) => {
  const b64 = String(u).split('cloudfront.net/')[1];
  if (!b64) return u.slice(-50);
  try {
    const j = JSON.parse(Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const w = j.edits && j.edits.resize && j.edits.resize.width;
    return `${j.key}  @${w}px`;
  } catch { return u.slice(-50); }
};

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-pv-${Date.now()}`, 'about:blank',
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
const reqs = new Map();
let t0 = null;
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  const p = m.params;
  if (m.method === 'Network.requestWillBeSent') {
    if (t0 === null) t0 = p.timestamp;
    reqs.set(p.requestId, {
      url: p.request.url, type: p.type, start: (p.timestamp - t0) * 1000,
      priority: p.request.initialPriority, initiator: p.initiator && p.initiator.type,
    });
  }
  if (m.method === 'Network.resourceChangedPriority') {
    const r = reqs.get(p.requestId); if (r) r.newPriority = p.newPriority;
  }
  if (m.method === 'Network.loadingFinished') {
    const r = reqs.get(p.requestId); if (!r) return;
    r.end = (p.timestamp - t0) * 1000;
    r.bytes = p.encodedDataLength;
  }
};
const send = (m, p = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method: m, params: p })); });

await send('Page.enable');
await send('Network.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });
await send('Network.emulateNetworkConditions', {
  offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
});
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: 'window.__lcpUrl="";window.__lcpT=0;try{new PerformanceObserver(function(l){var e=l.getEntries();for(var i=0;i<e.length;i++){window.__lcpUrl=e[i].url||"";window.__lcpT=Math.round(e[i].startTime);}}).observe({type:"largest-contentful-paint",buffered:true});}catch(e){}',
});

await send('Page.navigate', { url });
await sleep(18000);

const got = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: '({u: window.__lcpUrl, t: window.__lcpT, preloads: [].slice.call(document.querySelectorAll("link[rel=preload][as=image]")).map(function(l){return l.href}), heroImgs: [].slice.call(document.querySelectorAll(".hero-product-grid img")).slice(0,4).map(function(i){var r=i.getBoundingClientRect();return {src:i.currentSrc||i.src, w:Math.round(r.width), h:Math.round(r.height), top:Math.round(r.top), loading:i.getAttribute("loading"), fp:i.getAttribute("fetchpriority")}})})',
});
const v = (got.result && got.result.result && got.result.result.value) || {};

console.log(`${url}\n`);
console.log(`LCP at ${v.t}ms:`);
console.log(`  ${decodeKey(v.u)}`);

console.log('\nPRELOADED IMAGES (and the priority they actually got):');
for (const p of v.preloads || []) {
  const r = [...reqs.values()].find((x) => x.url === p);
  const same = p === v.u ? '  <<< THIS IS THE LCP IMAGE' : '';
  console.log(`  ${decodeKey(p)}`);
  console.log(`     priority=${r ? r.priority : '?'}${r && r.newPriority ? ' -> ' + r.newPriority : ''}` +
    `  start=${r ? Math.round(r.start) : '?'}ms  end=${r && r.end ? Math.round(r.end) : '?'}ms` +
    `  ${r && r.bytes ? Math.round(r.bytes / 1024) + 'kB' : ''}${same}`);
}

console.log('\nFIRST FOUR HERO CARDS AS RENDERED:');
for (const h of v.heroImgs || []) {
  const r = [...reqs.values()].find((x) => x.url === h.src);
  console.log(`  ${h.w}x${h.h} css at y=${h.top}  loading=${h.loading} fetchpriority=${h.fp}` +
    `  priority=${r ? r.priority : '?'}  ${r && r.end ? Math.round(r.end) + 'ms' : ''}`);
  console.log(`     ${decodeKey(h.src)}`);
}

// How the browser spent the link before first paint.
const imgs = [...reqs.values()].filter((r) => r.type === 'Image' && r.end != null);
const scripts = [...reqs.values()].filter((r) => r.type === 'Script' && r.end != null);
console.log(`\nTOTALS: ${imgs.length} images ${Math.round(imgs.reduce((a, r) => a + (r.bytes || 0), 0) / 1024)}kB` +
  ` | ${scripts.length} scripts ${Math.round(scripts.reduce((a, r) => a + (r.bytes || 0), 0) / 1024)}kB`);
const byPri = new Map();
for (const r of imgs) byPri.set(r.priority, (byPri.get(r.priority) || 0) + 1);
console.log('  image request priorities: ' + [...byPri].map(([k, n]) => `${k}=${n}`).join(', '));

ws.close();
browser.kill();
