import { spawn } from 'node:child_process';

// Loads a page in headless Edge and reports everything the console and the
// network complained about.
//
//   node tools/eprolo/30-console-probe.mjs <url> [url...]
//
// Written to check that removing the Product JSON-LD left no runtime error
// behind, but it is general: any page, any number of them, one browser.

const URLS = process.argv.slice(2);
if (!URLS.length) { console.error('usage: 30-console-probe.mjs <url> [url...]'); process.exit(1); }

const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9407);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--disable-gpu',
  // Edge ships a coupon extension that throws on every page; it is not ours.
  '--disable-extensions', '--disable-component-extensions-with-background-pages',
  `--user-data-dir=${process.env.TEMP}\\edge-console-${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function firstPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const pages = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((t) => t.type === 'page');
      if (pages.length) return pages[0];
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
let bucket = { console: [], exceptions: [], failed: [] };

ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }

  // console.error / console.warn, and anything React logs during hydration.
  if (m.method === 'Runtime.consoleAPICalled' && /error|warning|assert/.test(m.params.type)) {
    const text = (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
    bucket.console.push(`[${m.params.type}] ${text.slice(0, 300)}`);
  }
  // Uncaught throws.
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    bucket.exceptions.push((d.exception?.description ?? d.text ?? '').slice(0, 300));
  }
  // Requests the page made that did not come back.
  if (m.method === 'Network.loadingFailed' && !m.params.canceled) {
    bucket.failed.push(`${m.params.type} ${m.params.errorText}`);
  }
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
    bucket.failed.push(`HTTP ${m.params.response.status} ${m.params.response.url.slice(0, 120)}`);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

await send('Network.enable');
await send('Page.enable');
await send('Runtime.enable');

let anyProblem = false;
for (const url of URLS) {
  bucket = { console: [], exceptions: [], failed: [] };
  await send('Page.navigate', { url });
  // Long enough for hydration and the client-side shuffle to settle.
  await sleep(9000);

  const ld = await send('Runtime.evaluate', {
    expression: `JSON.stringify([...document.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { return JSON.parse(s.textContent)['@type']; } catch { return 'INVALID'; } }))`,
    returnByValue: true,
  });

  console.log(`\n=== ${url}`);
  console.log(`  ld+json in live DOM : ${ld.result?.result?.value ?? '(unavailable)'}`);
  const problems = bucket.console.length + bucket.exceptions.length + bucket.failed.length;
  if (!problems) console.log('  console/exceptions/network : CLEAN');
  else {
    anyProblem = true;
    for (const e of bucket.exceptions) console.log(`  EXCEPTION : ${e}`);
    for (const c of bucket.console) console.log(`  CONSOLE   : ${c}`);
    for (const f of [...new Set(bucket.failed)]) console.log(`  NETWORK   : ${f}`);
  }
}

ws.close();
browser.kill();
process.exit(anyProblem ? 1 : 0);
