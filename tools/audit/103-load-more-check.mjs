import { spawn } from 'node:child_process';

// Does the Load More button add a page, exactly once per click?
//
//   node tools/audit/103-load-more-check.mjs <url> [port]
//
// The scroll version it replaces fired every request twice — measured on
// production as offset=0 twice, then offset=15 twice — because an effect
// watching groups.length re-read a `groupOffset` the first response had not
// committed yet. So "once per click" is the thing worth asserting.

const url = process.argv[2] ?? 'http://localhost:3000/rankings/';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.argv[3] ?? 9996);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-lm-${PORT}-${Date.now()}`, 'about:blank',
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
let calls = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Network.requestWillBeSent' && /\/api\/rankings/.test(m.params.request.url)) {
    calls.push(m.params.request.url.split('?')[1]);
  }
};
const send = (m, p = {}) => new Promise((res) => { const k = ++id; pending.set(k, res); ws.send(JSON.stringify({ id: k, method: m, params: p })); });
const evalIn = async (x) => (await send('Runtime.evaluate', { returnByValue: true, expression: x })).result?.result?.value;

await send('Page.enable');
await send('Network.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const CARDS = `document.querySelectorAll('button').length && [...document.querySelectorAll('button')].filter(b => (b.textContent||'').trim() === 'View all').length`;
const CLICK = `(() => {
  const b = [...document.querySelectorAll('button')].find(x => /Load More Categories/.test(x.textContent || ''));
  if (!b) return 'no button';
  if (b.disabled) return 'disabled';
  b.click();
  return 'clicked';
})()`;

await send('Page.navigate', { url });
await sleep(12000);
console.log(`${url}\n`);
console.log('  after load        : ' + (await evalIn(CARDS)) + ' cards, ' + calls.length + ' /api/rankings calls');

for (const n of [1, 2]) {
  calls = [];
  const r = await evalIn(CLICK);
  await sleep(7000);
  console.log(`  after click ${n}     : ${await evalIn(CARDS)} cards, ${calls.length} call(s) [${r}] ${calls.join(' | ')}`);
}

ws.close();
browser.kill();
