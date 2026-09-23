import { spawn } from 'node:child_process';

// The LCP image, phase by phase, from request to paint.
//
//   node tools/audit/80-lcp-anatomy.mjs <url> [runs]
//
// The payload work cut the document 40% and moved LCP not at all, so whatever
// drives it is in the image path. This splits that path into the parts that
// have different fixes:
//
//   discovery   how long before the request is even made
//   DNS/connect the cost of reaching the CDN at all
//   TTFB        the image server thinking (Serverless Image Handler resize)
//   download    bytes over the wire
//   decode      turning those bytes into pixels, on the main thread
//   render      everything between "decoded" and "painted"
//
// Every number is taken per run and reported per run, because a median over a
// metric this noisy hides which phase actually varies.

const url = process.argv[2] ?? 'https://affhan.com/';
const RUNS = Number(process.argv[3] ?? 1);
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9471);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-lcp-${Date.now()}`, 'about:blank',
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
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (m, p = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method: m, params: p })); });

await send('Page.enable');
await send('Network.enable');
await send('Runtime.enable');
// Lighthouse mobile, applied for real.
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });
await send('Network.emulateNetworkConditions', {
  offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
});
await send('Network.setCacheDisabled', { cacheDisabled: true });

await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__lcp = [];
    window.__fcp = 0;
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          const el = e.element;
          window.__lcp.push({
            t: Math.round(e.startTime),
            renderTime: Math.round(e.renderTime || 0),
            loadTime: Math.round(e.loadTime || 0),
            size: e.size,
            url: e.url || '',
            tag: el ? el.tagName : '?',
            cls: el ? String(el.className).slice(0, 70) : '',
            // What the layout actually gives it, versus what was downloaded.
            box: el && el.getBoundingClientRect ? (() => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })() : null,
            natural: el && el.naturalWidth ? [el.naturalWidth, el.naturalHeight] : null,
            loading: el ? el.getAttribute('loading') : null,
            fetchpriority: el ? el.getAttribute('fetchpriority') : null,
          });
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__fcp = Math.round(e.startTime);
      }).observe({ type: 'paint', buffered: true });
    } catch {}
  `,
});

for (let r = 0; r < RUNS; r++) {
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await send('Page.navigate', { url });
  await sleep(18000);

  const res = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const last = window.__lcp[window.__lcp.length - 1] || null;
      let rt = null;
      if (last && last.url) {
        const e = performance.getEntriesByType('resource').find(x => x.name === last.url);
        if (e) rt = {
          startTime: Math.round(e.startTime),
          domainLookup: Math.round(e.domainLookupEnd - e.domainLookupStart),
          connect: Math.round(e.connectEnd - e.connectStart),
          tls: e.secureConnectionStart ? Math.round(e.connectEnd - e.secureConnectionStart) : 0,
          ttfb: Math.round(e.responseStart - e.requestStart),
          download: Math.round(e.responseEnd - e.responseStart),
          responseEnd: Math.round(e.responseEnd),
          transferSize: e.transferSize, encoded: e.encodedBodySize, decoded: e.decodedBodySize,
          protocol: e.nextHopProtocol,
        };
      }
      const nav = performance.getEntriesByType('navigation')[0];
      return {
        fcp: window.__fcp,
        candidates: window.__lcp.length,
        lcp: last,
        res: rt,
        docTtfb: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
        preloads: [...document.querySelectorAll('link[rel=preload][as=image]')].map(l => l.href.slice(-28)),
      };
    })()`,
  });
  const v = res.result?.result?.value ?? {};
  const L = v.lcp, R = v.res;
  console.log(`\n--- run ${r + 1} --------------------------------------------------`);
  console.log(`  FCP ${v.fcp}ms | LCP ${L ? L.t : '?'}ms | ${v.candidates} candidate(s) | document TTFB ${v.docTtfb}ms`);
  if (L) {
    console.log(`  element : <${L.tag}> ${L.cls.slice(0, 60)}`);
    console.log(`  box     : ${L.box ? L.box.join('x') : '?'} css px   natural ${L.natural ? L.natural.join('x') : '?'}   loading=${L.loading} fetchpriority=${L.fetchpriority}`);
    console.log(`  url tail: ...${(L.url || '').slice(-40)}`);
  }
  if (R) {
    console.log(`  bytes   : ${R.transferSize} transfer / ${R.encoded} encoded / ${R.decoded} decoded   (${R.protocol})`);
    console.log(`  PHASES  request starts at ${R.startTime}ms`);
    console.log(`            dns ${String(R.domainLookup).padStart(5)}ms   connect ${String(R.connect).padStart(5)}ms (tls ${R.tls}ms)`);
    console.log(`            TTFB ${String(R.ttfb).padStart(4)}ms  <- image server thinking`);
    console.log(`            download ${String(R.download).padStart(4)}ms -> arrives ${R.responseEnd}ms`);
    if (L) console.log(`            decode+render ${String(L.t - R.responseEnd).padStart(4)}ms  <- arrival to paint`);
  }
}

ws.close();
browser.kill();
