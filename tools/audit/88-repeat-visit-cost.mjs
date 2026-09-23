import { spawn } from 'node:child_process';

// What does inlining the stylesheet actually cost a real browsing session?
//
//   node tools/audit/88-repeat-visit-cost.mjs <origin>
//
// Every route serves the same 31,706 B (gzipped) stylesheet, so inlining it
// puts that on every HTML response instead of one cacheable file. Whether that
// matters depends entirely on how often a session loads a fresh HTML document.
//
// This is an App Router site, so in-site navigation should be a client-side
// RSC fetch and NOT a new document - in which case the inline cost is paid on
// hard loads only (first visit, refresh, direct link, search-engine entry).
// This walks a session both ways and counts the bytes rather than assuming.

const origin = (process.argv[2] ?? 'https://affhan.com').replace(/\/$/, '');
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9600);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-rv-${Date.now()}`, 'about:blank',
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
let log = [];
const types = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  const p = m.params;
  if (m.method === 'Network.requestWillBeSent') types.set(p.requestId, { type: p.type, url: p.request.url });
  if (m.method === 'Network.loadingFinished') {
    const t = types.get(p.requestId);
    if (t) log.push({ type: t.type, url: t.url, bytes: p.encodedDataLength });
  }
};
const send = (m, p = {}) => new Promise((res) => { const k = ++id; pending.set(k, res); ws.send(JSON.stringify({ id: k, method: m, params: p })); });
const evalIn = async (x) => (await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: x })).result?.result?.value;

await send('Page.enable');
await send('Network.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
// Cache ON: that is the whole point - a repeat visit is a warm cache.
await send('Network.setCacheDisabled', { cacheDisabled: false });

const summarise = (label) => {
  const doc = log.filter((r) => r.type === 'Document');
  const css = log.filter((r) => r.type === 'Stylesheet');
  const total = log.reduce((a, r) => a + r.bytes, 0);
  console.log('  ' + label.padEnd(40) +
    String(doc.length).padStart(5) + ' docs ' + String(Math.round(doc.reduce((a, r) => a + r.bytes, 0) / 1024)).padStart(5) + 'kB' +
    String(css.length).padStart(5) + ' css ' + String(Math.round(css.reduce((a, r) => a + r.bytes, 0) / 1024)).padStart(5) + 'kB' +
    '   all ' + String(Math.round(total / 1024)).padStart(5) + 'kB / ' + String(log.length).padStart(3) + ' reqs');
  log = [];
};

console.log(`REPEAT-VISIT COST — ${origin}\n`);
console.log('  step'.padEnd(42) + 'documents'.padStart(12) + 'stylesheets'.padStart(14) + '        total');
console.log('  ' + '-'.repeat(92));

// 1. Cold first load.
await send('Page.navigate', { url: origin + '/' });
await sleep(12000);
summarise('1. first load (cold cache)');

// 2. In-site navigation by clicking, the way a visitor browses.
const clicked = await evalIn(`(() => {
  const a = [...document.querySelectorAll('a[href^="/products/"]')].find(x => x.offsetParent !== null);
  if (!a) return 'no link';
  a.click();
  return a.getAttribute('href');
})()`);
await sleep(9000);
summarise(`2. clicked in-site link (${String(clicked).slice(0, 20)})`);

// 3. Another in-site click.
await evalIn(`(() => { const a=[...document.querySelectorAll('a[href^="/"]')].find(x=>x.offsetParent!==null && !/products/.test(x.getAttribute('href')||'')); if(a) a.click(); })()`);
await sleep(9000);
summarise('3. another in-site click');

// 4. A hard load of a second route - a direct link or a refresh.
await send('Page.navigate', { url: origin + '/rankings/' });
await sleep(9000);
summarise('4. hard load of /rankings/ (warm cache)');

// 5. Reload the homepage, warm.
await send('Page.navigate', { url: origin + '/' });
await sleep(9000);
summarise('5. hard reload of / (warm cache)');

console.log('\n  A stylesheet count of 0 on a step means the browser reused its cache;');
console.log('  inlining would add ~31 kB gz to every step that fetched a document.');

ws.close();
browser.kill();
