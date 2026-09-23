import { spawn } from 'node:child_process';

// How much of LCP is the image, and how much is everything else competing
// with it for the link?
//
//   node tools/audit/83-lcp-headroom.mjs <url>
//
// 82 showed the LCP image is correctly preloaded but starts at Low priority
// and is only upgraded to High once layout knows it is in the viewport - by
// which point 17 other images and 21 scripts are already on the wire. 46 kB
// took 2,494ms on a link that carries it in ~230ms.
//
// Blocking the competition measures the ceiling directly: if LCP collapses
// when the other images are gone, the fix is priority and count, not the
// image itself. Nothing here is a proposed change - these are diagnostic
// conditions, several of which would break the page.

const url = process.argv[2] ?? 'https://affhan.com/';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE_PORT = Number(process.env.CDP_PORT ?? 9474);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(label, blocked, port) {
  const browser = spawn(EDGE, [
    `--remote-debugging-port=${port}`, '--headless=new', '--no-first-run',
    `--user-data-dir=${process.env.TEMP}/edge-hr-${port}-${Date.now()}`, 'about:blank',
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    try {
      const p = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === 'page');
      if (p.length) target = p[0];
    } catch {}
    if (!target) await sleep(500);
  }
  if (!target) { browser.kill(); throw new Error('no CDP page'); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  let bytes = 0, n = 0;
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Network.loadingFinished') { bytes += m.params.encodedDataLength; n++; }
  };
  const send = (mm, p = {}) => new Promise((res) => { const k = ++id; pending.set(k, res); ws.send(JSON.stringify({ id: k, method: mm, params: p })); });

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
  if (blocked.length) await send('Network.setBlockedURLs', { urls: blocked });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.__fcp=0;window.__lcpT=0;try{new PerformanceObserver(function(l){var e=l.getEntries();for(var i=0;i<e.length;i++){if(e[i].name==="first-contentful-paint")window.__fcp=Math.round(e[i].startTime);}}).observe({type:"paint",buffered:true});new PerformanceObserver(function(l){var e=l.getEntries();for(var i=0;i<e.length;i++){window.__lcpT=Math.round(e[i].startTime);}}).observe({type:"largest-contentful-paint",buffered:true});}catch(e){}',
  });

  await send('Page.navigate', { url });
  await sleep(16000);
  const got = await send('Runtime.evaluate', { returnByValue: true, expression: '({fcp:window.__fcp,lcp:window.__lcpT})' });
  const v = (got.result && got.result.result && got.result.result.value) || {};
  ws.close();
  browser.kill();
  return { label, fcp: v.fcp, lcp: v.lcp, kb: Math.round(bytes / 1024), n };
}

// The LCP image, from the run in 82. Blocking everything *except* it needs a
// wildcard list, so instead block the classes of competitor one at a time.
const CONDITIONS = [
  ['A  baseline, nothing blocked', []],
  ['B  no product/category images at all', ['*daje3fmp2npne.cloudfront.net*']],
  ['C  no JS chunks', ['*/_next/static/chunks/*']],
  ['D  neither images nor JS', ['*daje3fmp2npne.cloudfront.net*', '*/_next/static/chunks/*']],
];

console.log(`LCP HEADROOM — ${url}   (4x CPU, 1.6Mbps/150ms RTT)\n`);
console.log('  condition'.padEnd(40) + 'FCP'.padStart(8) + 'LCP'.padStart(8) + 'kB'.padStart(8) + 'reqs'.padStart(7));
console.log('  ' + '-'.repeat(69));
let i = 0;
for (const [label, blocked] of CONDITIONS) {
  const r = await run(label, blocked, BASE_PORT + i++);
  console.log('  ' + label.padEnd(38) + String(r.fcp).padStart(8) + String(r.lcp).padStart(8) +
    String(r.kb).padStart(8) + String(r.n).padStart(7));
}
console.log('\n  B and D deliberately break the page (no product images). They bound');
console.log('  what is reachable by loading less, they are not suggestions.');
