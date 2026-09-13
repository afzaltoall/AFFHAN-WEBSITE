import { spawn } from 'node:child_process';

// Why does /rankings/ sometimes sit on empty skeletons forever?
//
//   node tools/audit/93-rankings-stuck.mjs <url> [runs] [port]
//
// The page holds `loading` true until a request settles, so a stuck skeleton
// means either a request that never settles or one whose .finally is skipped.
// Both flows on the page share ONE `reqSeq` ref, and each handler bails when
// `seq !== reqSeq.current` — including in `.finally`, which is where `loading`
// is cleared. So a second request starting mid-flight can strand the first.
//
// This loads the page repeatedly and, for each attempt, records: every request
// to the page's APIs with status and timing, any console error or uncaught
// exception, whether any request never finished, and whether the grid ended up
// with real cards or bare skeletons.

const url = process.argv[2] ?? 'https://affhan.com/rankings/';
const RUNS = Number(process.argv[3] ?? 6);
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.argv[4] ?? 9900);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-rk-${PORT}-${Date.now()}`, 'about:blank',
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

let reqs = new Map();
let errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  const p = m.params;
  if (m.method === 'Network.requestWillBeSent') {
    if (/\/api\/(rankings|products|categories)/.test(p.request.url)) {
      reqs.set(p.requestId, { url: p.request.url.replace(/^https?:\/\/[^/]+/, ''), start: p.timestamp });
    }
  }
  if (m.method === 'Network.responseReceived') {
    const r = reqs.get(p.requestId); if (r) r.status = p.response.status;
  }
  if (m.method === 'Network.loadingFinished') {
    const r = reqs.get(p.requestId); if (r) { r.done = true; r.ms = Math.round((p.timestamp - r.start) * 1000); }
  }
  if (m.method === 'Network.loadingFailed') {
    const r = reqs.get(p.requestId); if (r) { r.done = true; r.failed = p.errorText; }
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = p.exceptionDetails;
    errors.push('EXCEPTION ' + ((d.exception && d.exception.description) || d.text || '').split('\n')[0].slice(0, 120));
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push('console.error ' + (m.params.args || []).map((a) => String(a.value || a.description || '')).join(' ').slice(0, 120));
  }
};
const send = (m, p = {}) => new Promise((res) => { const k = ++id; pending.set(k, res); ws.send(JSON.stringify({ id: k, method: m, params: p })); });
const evalIn = async (x) => (await send('Runtime.evaluate', { returnByValue: true, expression: x })).result?.result?.value;

await send('Page.enable');
await send('Network.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

// Real cards carry product links; skeletons are bare divs with no anchors.
const GRID = `(() => {
  const cards = document.querySelectorAll('a[href^="/products/"]').length;
  const pulses = document.querySelectorAll('.animate-pulse, [class*="animate-pulse"]').length;
  const imgs = document.images.length;
  return { cards, pulses, imgs };
})()`;

console.log(`${url}   ${RUNS} loads\n`);
console.log('  run  outcome        cards  pulses  imgs   API calls');
console.log('  ' + '-'.repeat(86));

let stuck = 0;
for (let i = 0; i < RUNS; i++) {
  reqs = new Map();
  errors = [];
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await send('Page.navigate', { url });
  await sleep(13000);

  const g = await evalIn(GRID);
  const calls = [...reqs.values()];
  const unfinished = calls.filter((r) => !r.done);
  const bad = calls.filter((r) => r.failed || (r.status && r.status >= 400));
  const ok = g.cards > 0;
  if (!ok) stuck++;

  console.log('  ' + String(i + 1).padStart(3) + '  ' + (ok ? 'loaded' : 'STUCK SKELETON').padEnd(15) +
    String(g.cards).padStart(5) + String(g.pulses).padStart(8) + String(g.imgs).padStart(6) + '   ' +
    calls.map((r) => `${r.url.split('?')[0]}${r.status ? ' ' + r.status : ''}${r.failed ? ' ' + r.failed : ''}${r.done ? ' ' + r.ms + 'ms' : ' NEVER FINISHED'}`).join(' | ').slice(0, 200));
  if (unfinished.length) console.log('       unfinished: ' + unfinished.map((r) => r.url).join(', '));
  if (bad.length) console.log('       failed/4xx/5xx: ' + bad.map((r) => `${r.url} ${r.status || r.failed}`).join(', '));
  for (const e of errors.slice(0, 3)) console.log('       ' + e);
}

console.log(`\n  ${stuck}/${RUNS} loads ended on empty skeletons`);
ws.close();
browser.kill();
