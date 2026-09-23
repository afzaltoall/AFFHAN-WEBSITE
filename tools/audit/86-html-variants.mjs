import { spawn } from 'node:child_process';

// A/B named rewrites of the live HTML, so an option can be costed before it
// is built.
//
//   node tools/audit/86-html-variants.mjs <url> [runs]
//
// Generalised from 85, which measured fetchpriority and found it worth exactly
// nothing once the confound was removed. That confound is the reason this
// intercepts the document in EVERY arm, including the control: CDP's Fetch
// domain adds a round trip through the debugger, and paying it in only one arm
// made a neutral change look like a 248ms regression.
//
// Every variant is a pure markup rewrite of the real production response, on
// the same network and CPU emulation, so the delta between arms is the
// variant and nothing else.

const url = process.argv[2] ?? 'https://affhan.com/';
const RUNS = Number(process.argv[3] ?? 3);
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE_PORT = Number(process.env.CDP_PORT ?? 9520);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Re-encode a Serverless Image Handler URL at a different width.
function reWidth(u, w) {
  const b64 = u.split('cloudfront.net/')[1];
  if (!b64) return u;
  try {
    const j = JSON.parse(Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!j.edits || !j.edits.resize) return u;
    j.edits.resize.width = w;
    return 'https://daje3fmp2npne.cloudfront.net/' +
      Buffer.from(JSON.stringify(j)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  } catch { return u; }
}

const CDN = /https:\/\/daje3fmp2npne\.cloudfront\.net\/[A-Za-z0-9_=-]+/g;

const VARIANTS = {
  'A control (rewritten, unchanged)': (html) => html,

  // What a correct srcset would pick at this DPR: the card is 178 CSS px, so
  // 1.75x wants ~311 device px and the browser would take the 320 candidate.
  'B every image at 320px': (html) => html.replace(CDN, (u) => reWidth(u, 320)),

  // The floor for image bytes, to bound what width alone can ever buy.
  'C every image at 240px': (html) => html.replace(CDN, (u) => reWidth(u, 240)),

  // Drop the script preload hints. Next emits <link rel=preload as=script
  // fetchPriority=low> for each chunk; the chunks are still fetched by their
  // own tags, but later and with less up-front concurrency.
  'D no script preloads': (html) =>
    html.replace(/<link[^>]*rel="preload"[^>]*as="script"[^>]*>/g, ''),

  'E 320px and no script preloads': (html) =>
    html.replace(CDN, (u) => reWidth(u, 320))
        .replace(/<link[^>]*rel="preload"[^>]*as="script"[^>]*>/g, ''),
};

async function run(name, transform, port) {
  const browser = spawn(EDGE, [
    `--remote-debugging-port=${port}`, '--headless=new', '--no-first-run',
    `--user-data-dir=${process.env.TEMP}/edge-hv-${port}-${Date.now()}`, 'about:blank',
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

  let imgKb = 0, jsKb = 0, imgN = 0;
  const types = new Map();
  ws.onmessage = async (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    const p = m.params;
    if (m.method === 'Fetch.requestPaused') {
      if (p.resourceType !== 'Document') { await send('Fetch.continueRequest', { requestId: p.requestId }); return; }
      const body = await send('Fetch.getResponseBody', { requestId: p.requestId });
      const r = body.result;
      if (!r || !r.body) { await send('Fetch.continueRequest', { requestId: p.requestId }); return; }
      const html = transform(r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body);
      await send('Fetch.fulfillRequest', {
        requestId: p.requestId, responseCode: 200,
        responseHeaders: [
          { name: 'content-type', value: 'text/html; charset=utf-8' },
          { name: 'cache-control', value: 'no-store' },
        ],
        body: Buffer.from(html, 'utf8').toString('base64'),
      });
      return;
    }
    if (m.method === 'Network.requestWillBeSent') types.set(p.requestId, p.type);
    if (m.method === 'Network.loadingFinished') {
      const t = types.get(p.requestId);
      const kb = p.params ? 0 : p.encodedDataLength / 1024;
      if (t === 'Image') { imgKb += kb; imgN++; }
      if (t === 'Script') jsKb += kb;
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
    source: 'window.__fcp=0;window.__lcpT=0;try{new PerformanceObserver(function(l){var e=l.getEntries();for(var i=0;i<e.length;i++){if(e[i].name==="first-contentful-paint")window.__fcp=Math.round(e[i].startTime);}}).observe({type:"paint",buffered:true});new PerformanceObserver(function(l){var e=l.getEntries();for(var i=0;i<e.length;i++){window.__lcpT=Math.round(e[i].startTime);}}).observe({type:"largest-contentful-paint",buffered:true});}catch(e){}',
  });

  await send('Page.navigate', { url });
  await sleep(16000);
  const got = await send('Runtime.evaluate', { returnByValue: true, expression: '({fcp:window.__fcp,lcp:window.__lcpT})' });
  const v = (got.result && got.result.result && got.result.result.value) || {};
  ws.close();
  browser.kill();
  return { fcp: v.fcp, lcp: v.lcp, imgKb: Math.round(imgKb), jsKb: Math.round(jsKb), imgN };
}

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const results = new Map(Object.keys(VARIANTS).map((k) => [k, []]));

console.log(`HTML VARIANTS — ${url}   (4x CPU, 1.6Mbps/150ms, ${RUNS} runs each)\n`);
let port = BASE_PORT;
for (let i = 0; i < RUNS; i++) {
  for (const [name, fn] of Object.entries(VARIANTS)) {
    results.get(name).push(await run(name, fn, port++));
  }
}

console.log('  variant'.padEnd(36) + 'FCP'.padStart(7) + 'LCP'.padStart(7) + 'img kB'.padStart(9) + 'js kB'.padStart(8) + '   vs control');
console.log('  ' + '-'.repeat(80));
const ctrl = med(results.get('A control (rewritten, unchanged)').map((r) => r.lcp));
for (const [name, rs] of results) {
  const lcp = med(rs.map((r) => r.lcp));
  const d = lcp - ctrl;
  console.log('  ' + name.padEnd(34) +
    String(med(rs.map((r) => r.fcp))).padStart(7) + String(lcp).padStart(7) +
    String(med(rs.map((r) => r.imgKb))).padStart(9) + String(med(rs.map((r) => r.jsKb))).padStart(8) +
    (name.startsWith('A') ? '        —' : `   ${d > 0 ? '+' : ''}${d}ms`));
}
