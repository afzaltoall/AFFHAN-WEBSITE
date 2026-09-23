import { spawn } from 'node:child_process';

// What would fetchpriority="high" on the LCP image actually buy?
//
//   node tools/audit/85-fetchpriority-sim.mjs <url> [runs]
//
// The LCP image is correctly preloaded but its request starts at Low priority
// and is only promoted to High once layout proves it is in the viewport - by
// which time 15 scripts and 16 other images are already on a 200 kB/s link.
//
// Rather than ship the attribute and hope, this intercepts the document with
// CDP's Fetch domain and rewrites it on the way in: fetchpriority="high" on
// the 400px product preload and on the one <img> that is not lazy. Same page,
// same network, same CPU - the only difference is the attribute, so the delta
// is the attribute's worth.

const url = process.argv[2] ?? 'https://affhan.com/';
const RUNS = Number(process.argv[3] ?? 3);
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE_PORT = Number(process.env.CDP_PORT ?? 9490);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(patch, port) {
  const browser = spawn(EDGE, [
    `--remote-debugging-port=${port}`, '--headless=new', '--no-first-run',
    `--user-data-dir=${process.env.TEMP}/edge-fp-${port}-${Date.now()}`, 'about:blank',
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
  const send = (m, p = {}) => new Promise((res) => { const k = ++id; pending.set(k, res); ws.send(JSON.stringify({ id: k, method: m, params: p })); });

  const imgReqs = new Map();
  let t0 = null;
  let patched = false;

  ws.onmessage = async (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    const p = m.params;

    if (m.method === 'Fetch.requestPaused') {
      if (p.resourceType !== 'Document') {
        await send('Fetch.continueRequest', { requestId: p.requestId });
        return;
      }
      const body = await send('Fetch.getResponseBody', { requestId: p.requestId });
      const r = body.result;
      if (!r || !r.body) { await send('Fetch.continueRequest', { requestId: p.requestId }); return; }
      let html = r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body;

      // The 400px product preload: give it an explicit high priority.
      const before = html;
      if (patch) {
      html = html.replace(
        /(<link rel="preload" as="image" href="https:\/\/daje3fmp2npne\.cloudfront\.net\/[^"]*")(\s*\/?>)/g,
        (mm, head, tail) => (mm.includes('fetchpriority') ? mm : head + ' fetchpriority="high"' + tail)
      );
      // The single non-lazy <img> is the priority hero card.
      html = html.replace(/<img((?:(?!loading=)[^>])*?)\/>/g, (mm, attrs) => {
        if (mm.includes('fetchpriority') || !mm.includes('data-nimg')) return mm;
        if (!/width="400"/.test(mm)) return mm;
        return '<img fetchpriority="high"' + attrs + '/>';
      });
      }
      patched = html !== before;

      await send('Fetch.fulfillRequest', {
        requestId: p.requestId,
        responseCode: 200,
        responseHeaders: [
          { name: 'content-type', value: 'text/html; charset=utf-8' },
          { name: 'cache-control', value: 'no-store' },
        ],
        body: Buffer.from(html, 'utf8').toString('base64'),
      });
      return;
    }

    if (m.method === 'Network.requestWillBeSent') {
      if (t0 === null) t0 = p.timestamp;
      if (p.type === 'Image') imgReqs.set(p.requestId, { url: p.request.url, pri: p.request.initialPriority, start: (p.timestamp - t0) * 1000 });
    }
    if (m.method === 'Network.loadingFinished') {
      const r = imgReqs.get(p.requestId);
      if (r) { r.end = (p.timestamp - t0) * 1000; r.bytes = p.encodedDataLength; }
    }
  };

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
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Response' }] });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.__fcp=0;window.__lcpT=0;window.__lcpU="";try{new PerformanceObserver(function(l){var e=l.getEntries();for(var i=0;i<e.length;i++){if(e[i].name==="first-contentful-paint")window.__fcp=Math.round(e[i].startTime);}}).observe({type:"paint",buffered:true});new PerformanceObserver(function(l){var e=l.getEntries();for(var i=0;i<e.length;i++){window.__lcpT=Math.round(e[i].startTime);window.__lcpU=e[i].url||"";}}).observe({type:"largest-contentful-paint",buffered:true});}catch(e){}',
  });

  await send('Page.navigate', { url });
  await sleep(16000);
  const got = await send('Runtime.evaluate', { returnByValue: true, expression: '({fcp:window.__fcp,lcp:window.__lcpT,u:window.__lcpU})' });
  const v = (got.result && got.result.result && got.result.result.value) || {};
  const lcpImg = [...imgReqs.values()].find((r) => r.url === v.u);
  ws.close();
  browser.kill();
  return { fcp: v.fcp, lcp: v.lcp, patched, lcpImg };
}

console.log(`FETCHPRIORITY SIMULATION — ${url}   (4x CPU, 1.6Mbps/150ms)\n`);
console.log('  run  variant                    FCP     LCP   LCP img pri   img done');
console.log('  ' + '-'.repeat(70));
const acc = { off: [], on: [] };
for (let i = 0; i < RUNS; i++) {
  for (const [label, patch] of [['as shipped', false], ['+fetchpriority', true]]) {
    const r = await run(patch, BASE_PORT + (i * 2) + (patch ? 1 : 0));
    acc[patch ? 'on' : 'off'].push(r.lcp);
    console.log('  ' + String(i + 1).padStart(3) + '  ' + label.padEnd(24) +
      String(r.fcp).padStart(6) + String(r.lcp).padStart(8) +
      String(r.lcpImg ? r.lcpImg.pri : '?').padStart(12) +
      String(r.lcpImg && r.lcpImg.end ? Math.round(r.lcpImg.end) + 'ms' : '?').padStart(11) +
      (patch && !r.patched ? '   (PATCH DID NOT APPLY)' : ''));
  }
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log(`\n  median LCP   as shipped ${med(acc.off)}ms   with fetchpriority ${med(acc.on)}ms   delta ${med(acc.on) - med(acc.off)}ms`);
