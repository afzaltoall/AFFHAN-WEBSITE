import { spawn } from 'node:child_process';

// Why is first paint at 3.1s when the document answers in 26ms?
//
//   node tools/audit/81-critical-path.mjs <url>
//
// 80-lcp-anatomy found LCP only 16ms after FCP, so this is not an image
// problem in the way it looked - almost the whole of LCP is the wait for the
// page's FIRST paint, which the LCP image then happens to be part of.
//
// PerformanceResourceTiming cannot break down cross-origin requests without
// Timing-Allow-Origin, and the CDN does not send it, so every phase came back
// zero there. CDP's Network.responseReceived carries the real timing
// regardless, so this waterfall is measured rather than inferred.

const url = process.argv[2] ?? 'https://affhan.com/';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9472);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-cp-${Date.now()}`, 'about:blank',
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
      priority: p.request.initialPriority,
      initiator: p.initiator && p.initiator.type,
    });
  }
  if (m.method === 'Network.responseReceived') {
    const r = reqs.get(p.requestId); if (!r) return;
    r.status = p.response.status;
    r.protocol = p.response.protocol;
    const t = p.response.timing;
    if (t) {
      // Fields are ms offsets from requestTime (which is in seconds).
      r.dns = t.dnsEnd > 0 ? t.dnsEnd - t.dnsStart : 0;
      r.connect = t.connectEnd > 0 ? t.connectEnd - t.connectStart : 0;
      r.ssl = t.sslEnd > 0 ? t.sslEnd - t.sslStart : 0;
      r.stalled = t.sendStart;                      // queued or blocked before bytes went out
      r.ttfb = t.receiveHeadersEnd - t.sendEnd;     // the server thinking
    }
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

const OBSERVER = [
  'window.__fcp=0;window.__lcpUrl="";window.__lcpT=0;',
  'try{',
  'new PerformanceObserver(function(l){var es=l.getEntries();for(var i=0;i<es.length;i++){if(es[i].name==="first-contentful-paint"){window.__fcp=Math.round(es[i].startTime);}}}).observe({type:"paint",buffered:true});',
  'new PerformanceObserver(function(l){var es=l.getEntries();for(var i=0;i<es.length;i++){window.__lcpUrl=es[i].url||"";window.__lcpT=Math.round(es[i].startTime);}}).observe({type:"largest-contentful-paint",buffered:true});',
  '}catch(e){}',
].join('\n');
await send('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVER });

await send('Page.navigate', { url });
await sleep(18000);

const got = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: '({fcp: window.__fcp, lcpUrl: window.__lcpUrl, lcpT: window.__lcpT})',
});
const v = (got.result && got.result.result && got.result.result.value) || {};
const all = [...reqs.values()].filter((r) => r.end != null).sort((a, b) => a.start - b.start);

console.log(`${url}   FCP ${v.fcp}ms   LCP ${v.lcpT}ms   (4x CPU, 1.6Mbps/150ms RTT)\n`);

const blocking = all.filter((r) => r.type === 'Document' || r.type === 'Stylesheet' || (r.type === 'Script' && r.priority === 'High'));
console.log('RENDER PATH (document, stylesheets, high-priority scripts)');
console.log('  start    end   stall   ttfb    kB  pri        resource');
console.log('  ' + '-'.repeat(94));
for (const r of blocking.slice(0, 14)) {
  console.log('  ' + String(Math.round(r.start)).padStart(5) + String(Math.round(r.end)).padStart(7) +
    String(Math.round(r.stalled || 0)).padStart(8) + String(Math.round(r.ttfb || 0)).padStart(7) +
    String(Math.round((r.bytes || 0) / 1024)).padStart(6) + '  ' + String(r.priority || '').padEnd(10) +
    (r.url.length > 50 ? '...' + r.url.slice(-49) : r.url));
}

const lcpReq = all.find((r) => r.url === v.lcpUrl);
if (lcpReq) {
  console.log('\nTHE LCP IMAGE');
  console.log(`  requested at   ${Math.round(lcpReq.start)}ms   priority=${lcpReq.priority}  initiator=${lcpReq.initiator}`);
  console.log(`  stalled/queued ${Math.round(lcpReq.stalled || 0)}ms  <- waiting on a connection or higher-priority work`);
  console.log(`  server TTFB    ${Math.round(lcpReq.ttfb || 0)}ms  <- Serverless Image Handler`);
  console.log(`  finished at    ${Math.round(lcpReq.end)}ms   ${Math.round((lcpReq.bytes || 0) / 1024)} kB   ${lcpReq.protocol}`);
  console.log(`  painted at     ${v.lcpT}ms  -> ${v.lcpT - Math.round(lcpReq.end)}ms between arrival and paint`);
} else {
  console.log('\n(LCP url not matched in the network log)');
}

const beforeFcp = all.filter((r) => r.start < v.fcp);
const byType = new Map();
for (const r of beforeFcp) {
  const t = byType.get(r.type) || { n: 0, kb: 0 };
  t.n++; t.kb += (r.bytes || 0) / 1024; byType.set(r.type, t);
}
console.log(`\nREQUESTS STARTED BEFORE FCP: ${beforeFcp.length}`);
for (const [k, t] of [...byType].sort((a, b) => b[1].kb - a[1].kb)) {
  console.log(`  ${String(k).padEnd(12)} ${String(t.n).padStart(3)} requests  ${Math.round(t.kb)} kB`);
}
const images = beforeFcp.filter((r) => r.type === 'Image');
console.log(`\n  images competing before first paint: ${images.length}, ${Math.round(images.reduce((a, r) => a + (r.bytes || 0), 0) / 1024)} kB`);
for (const s of images.sort((a, b) => (b.end - b.start) - (a.end - a.start)).slice(0, 6)) {
  console.log(`    ${String(Math.round(s.end - s.start)).padStart(5)}ms  ${String(Math.round((s.bytes || 0) / 1024)).padStart(4)}kB  stall ${String(Math.round(s.stalled || 0)).padStart(5)}ms  pri=${s.priority}`);
}

ws.close();
browser.kill();
