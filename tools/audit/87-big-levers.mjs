import { spawn } from 'node:child_process';

// The two levers with functionality attached, costed before anyone builds them.
//
//   node tools/audit/87-big-levers.mjs <url> [runs]
//
// 86 costed the cheap markup changes and they are small: 320px images -96ms,
// dropping script preloads -120ms, against an LCP near 3,800ms. The only large
// number anywhere in this investigation is 83's, where blocking the JS chunks
// entirely took FCP from 3,192ms to 744ms.
//
// Blocking JS is not a shippable change - the page never hydrates. These two
// variants are the shippable shapes of the same idea, so the numbers mean
// something:
//
//   F  hydrate late   - the chunks still load and the page still hydrates,
//                       but the requests start on window.load instead of
//                       competing with the stylesheet. Costs interactivity
//                       delay, costs nothing visually.
//   G  fewer images    - only the images in or near the first screen are given
//                       a src up front. Costs nothing above the fold; the rest
//                       would need a real lazy loader to come back.
//   H  both.
//
// Control is rewritten too, for the reason in 86: intercepting in only one arm
// measured a neutral change as a 248ms regression.

const url = process.argv[2] ?? 'https://affhan.com/';
const RUNS = Number(process.argv[3] ?? 3);
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE_PORT = Number(process.env.CDP_PORT ?? 9560);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Move every chunk <script> to fire on window.load. Next's chunks are
// type="module"/defer already; this delays the REQUEST, not just execution.
function deferScripts(html) {
  const srcs = [];
  let out = html.replace(/<script[^>]*src="([^"]*\/_next\/static\/chunks\/[^"]*)"[^>]*>\s*<\/script>/g, (m, src) => {
    srcs.push(src);
    return '';
  });
  out = out.replace(/<link[^>]*rel="preload"[^>]*as="script"[^>]*>/g, '');
  if (!srcs.length) return out;
  const loader = `<script>addEventListener("load",function(){` +
    JSON.stringify(srcs) + `.forEach(function(s){var e=document.createElement("script");e.src=s;e.async=false;document.body.appendChild(e);});});</script>`;
  return out.replace('</body>', loader + '</body>');
}

// Keep a src on only the first N product images; blank the rest so they are
// not requested. Category tiles are left alone.
function fewerImages(html, keep) {
  let n = 0;
  return html.replace(/<img\b[^>]*>/g, (tag) => {
    if (!/daje3fmp2npne\.cloudfront\.net/.test(tag)) return tag;
    n++;
    if (n <= keep) return tag;
    return tag.replace(/\ssrc="[^"]*"/, ' src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="');
  });
}

// Fetched once up front so the rewrite is synchronous.
const cssCache = new Map();
async function warmCss(html) {
  const links = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map((m) => m[1]);
  for (const href of links) {
    if (cssCache.has(href)) continue;
    const abs = href.startsWith('http') ? href : new URL(href, url).toString();
    try { cssCache.set(href, await (await fetch(abs)).text()); } catch { cssCache.set(href, null); }
  }
}
function inlineCss(html) {
  return html.replace(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (m, href) => {
    const css = cssCache.get(href);
    return css ? '<style>' + css + '</style>' : m;
  });
}

const VARIANTS = {
  'A control (rewritten, unchanged)': (h) => h,
  'F hydrate on window.load': (h) => deferScripts(h),
  'G only 6 images up front': (h) => fewerImages(h, 6),
  'H both': (h) => deferScripts(fewerImages(h, 6)),
  'I inline the blocking CSS': (h) => inlineCss(h),
  'J inline CSS + defer scripts': (h) => deferScripts(inlineCss(h)),
};

async function run(transform, port) {
  const browser = spawn(EDGE, [
    `--remote-debugging-port=${port}`, '--headless=new', '--no-first-run',
    `--user-data-dir=${process.env.TEMP}/edge-bl-${port}-${Date.now()}`, 'about:blank',
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

  let imgKb = 0, jsKb = 0;
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
      const raw = r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body;
      await warmCss(raw);
      const html = transform(raw);
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
      if (t === 'Image') imgKb += p.encodedDataLength / 1024;
      if (t === 'Script') jsKb += p.encodedDataLength / 1024;
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
  await sleep(20000);
  // Did it still hydrate? React marks the root; a dead page is not a saving.
  const got = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: '({fcp:window.__fcp,lcp:window.__lcpT,hydrated:!!document.querySelector("[data-nimg]")&&typeof window.next==="object",imgs:document.images.length})',
  });
  const v = (got.result && got.result.result && got.result.result.value) || {};
  ws.close();
  browser.kill();
  return { fcp: v.fcp, lcp: v.lcp, hydrated: v.hydrated, imgs: v.imgs, imgKb: Math.round(imgKb), jsKb: Math.round(jsKb) };
}

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const results = new Map(Object.keys(VARIANTS).map((k) => [k, []]));

console.log(`BIG LEVERS — ${url}   (4x CPU, 1.6Mbps/150ms, ${RUNS} runs each)\n`);
let port = BASE_PORT;
for (let i = 0; i < RUNS; i++) {
  for (const [, fn] of Object.entries(VARIANTS)) {
    const name = Object.keys(VARIANTS)[Object.values(VARIANTS).indexOf(fn)];
    results.get(name).push(await run(fn, port++));
  }
}

console.log('  variant'.padEnd(36) + 'FCP'.padStart(7) + 'LCP'.padStart(7) + 'img kB'.padStart(9) + 'js kB'.padStart(8) + '  hydrated' + '   vs control');
console.log('  ' + '-'.repeat(92));
const ctrl = med(results.get('A control (rewritten, unchanged)').map((r) => r.lcp));
for (const [name, rs] of results) {
  const lcp = med(rs.map((r) => r.lcp));
  const d = lcp - ctrl;
  console.log('  ' + name.padEnd(34) +
    String(med(rs.map((r) => r.fcp))).padStart(7) + String(lcp).padStart(7) +
    String(med(rs.map((r) => r.imgKb))).padStart(9) + String(med(rs.map((r) => r.jsKb))).padStart(8) +
    String(rs.filter((r) => r.hydrated).length + '/' + rs.length).padStart(10) +
    (name.startsWith('A') ? '        —' : `   ${d > 0 ? '+' : ''}${d}ms`));
}
