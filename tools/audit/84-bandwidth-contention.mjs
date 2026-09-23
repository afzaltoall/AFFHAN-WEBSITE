import { spawn } from 'node:child_process';

// What is on the wire while the render-blocking CSS is trying to arrive?
//
//   node tools/audit/84-bandwidth-contention.mjs <url>
//
// 83 showed FCP falling from 3,192ms to 744ms when the JS chunks are blocked,
// and only to 2,804ms when every product image is blocked. So first paint is
// not waiting on images - it is waiting on a 30 kB stylesheet that takes
// 2,164ms to arrive, which at 1.6 Mbps should take about 150ms.
//
// This lists every request by priority and shows how many were open at once
// while that stylesheet was in flight, which is the difference between "the
// CDN is slow" and "the stylesheet is sharing the link with 40 other streams".

const url = process.argv[2] ?? 'https://affhan.com/';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9480);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-bc-${Date.now()}`, 'about:blank',
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
    });
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
  source: 'window.__fcp=0;try{new PerformanceObserver(function(l){var e=l.getEntries();for(var i=0;i<e.length;i++){if(e[i].name==="first-contentful-paint")window.__fcp=Math.round(e[i].startTime);}}).observe({type:"paint",buffered:true});}catch(e){}',
});

await send('Page.navigate', { url });
await sleep(16000);
const got = await send('Runtime.evaluate', { returnByValue: true, expression: 'window.__fcp' });
const fcp = (got.result && got.result.result && got.result.result.value) || 0;

const all = [...reqs.values()].filter((r) => r.end != null);
const css = all.filter((r) => r.type === 'Stylesheet').sort((a, b) => (b.bytes || 0) - (a.bytes || 0))[0];

console.log(`${url}   FCP ${fcp}ms   (4x CPU, 1.6Mbps = ~200 kB/s)\n`);

console.log('BYTES BY PRIORITY, everything that started before FCP');
const pri = new Map();
for (const r of all.filter((r) => r.start < fcp)) {
  const k = `${r.priority}/${r.type}`;
  const v = pri.get(k) || { n: 0, kb: 0 };
  v.n++; v.kb += (r.bytes || 0) / 1024; pri.set(k, v);
}
console.log('  priority/type'.padEnd(28) + 'reqs'.padStart(6) + 'kB'.padStart(8));
console.log('  ' + '-'.repeat(42));
let total = 0;
for (const [k, v] of [...pri].sort((a, b) => b[1].kb - a[1].kb)) {
  total += v.kb;
  console.log('  ' + k.padEnd(26) + String(v.n).padStart(6) + String(Math.round(v.kb)).padStart(8));
}
console.log('  ' + 'TOTAL'.padEnd(26) + ''.padStart(6) + String(Math.round(total)).padStart(8) + '  kB before first paint');
console.log(`  at ~200 kB/s that is ${(total / 200).toFixed(1)}s of link time alone`);

console.log("\nINDIVIDUAL SCRIPTS THAT LAND BEFORE FIRST PAINT");
for (const r of all.filter((r) => r.type === "Script" && r.start < fcp).sort((a,b)=>(b.bytes||0)-(a.bytes||0))) {
  console.log("  " + String(Math.round((r.bytes||0)/1024)).padStart(5) + "kB  " +
    String(Math.round(r.start)).padStart(5) + "->" + String(Math.round(r.end)).padStart(5) + "ms  " +
    String(r.priority).padEnd(9) + r.url.split("/").pop().split("?")[0]);
}

if (css) {
  console.log(`\nTHE RENDER-BLOCKING STYLESHEET`);
  console.log(`  ${Math.round((css.bytes || 0) / 1024)} kB, priority ${css.priority}, ${Math.round(css.start)}ms -> ${Math.round(css.end)}ms (${Math.round(css.end - css.start)}ms)`);
  console.log(`  at 200 kB/s its bytes are ~${Math.round((css.bytes || 0) / 1024 / 200 * 1000)}ms of transfer`);
  const during = all.filter((r) => r.start < css.end && (r.end || 0) > css.start && r !== css);
  const kbDuring = during.reduce((a, r) => a + (r.bytes || 0), 0) / 1024;
  console.log(`  concurrent with it: ${during.length} other requests, ${Math.round(kbDuring)} kB`);
  const byT = new Map();
  for (const r of during) { const v = byT.get(r.type) || { n: 0, kb: 0 }; v.n++; v.kb += (r.bytes || 0) / 1024; byT.set(r.type, v); }
  for (const [k, v] of [...byT].sort((a, b) => b[1].kb - a[1].kb)) {
    console.log(`    ${String(k).padEnd(12)} ${String(v.n).padStart(3)}  ${Math.round(v.kb)} kB`);
  }
}

ws.close();
browser.kill();
