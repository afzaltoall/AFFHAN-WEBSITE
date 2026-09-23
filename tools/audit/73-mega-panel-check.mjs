import { spawn } from 'node:child_process';

// Does the mega panel still work now that its tree is fetched, not shipped?
//
//   node tools/audit/73-mega-panel-check.mjs <url>
//
// Payload numbers say the category rows left the document. They say nothing
// about whether the panel that needs them still opens. This clicks it two ways
// — cold (immediately, before the idle prefetch can run) and warm (after it) —
// and reports how many categories each ends up rendering.

const url = process.argv[2] ?? 'http://localhost:3000/';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9452);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-mp-${Date.now()}`, 'about:blank',
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
const apiCalls = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('/api/categories')) {
    apiCalls.push(Math.round(m.params.timestamp * 1000));
  }
};
const send = (m, p = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
const evalIn = async (expression) =>
  (await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression })).result?.result?.value;

await send('Page.enable');
await send('Network.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });

// Find the button by its text rather than a class, so a restyle does not
// silently turn this check into a no-op.
const CLICK_VIEW_ALL = `(() => {
  const b = [...document.querySelectorAll('button')].find(x => /view all/i.test(x.textContent || ''));
  if (!b) return 'no button';
  b.click();
  return 'clicked';
})()`;
const PANEL_STATE = `(() => {
  const status = document.querySelector('[aria-label="Loading categories"]');
  const links = document.querySelectorAll('[class*="fixed"][class*="z-[70]"] button, [class*="fixed"][class*="z-[70]"] a');
  return { loading: !!status, interactive: links.length };
})()`;

for (const mode of ['cold', 'warm']) {
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  apiCalls.length = 0;
  await send('Page.navigate', { url });
  // cold: click as soon as the page is usable, racing the idle prefetch.
  // warm: give the prefetch time to land first.
  await sleep(mode === 'cold' ? 2500 : 12000);
  const clicked = await evalIn(CLICK_VIEW_ALL);
  const immediately = await evalIn(PANEL_STATE);
  await sleep(4000);
  const after = await evalIn(PANEL_STATE);
  console.log(`${mode.padEnd(5)} click=${clicked}  /api/categories requests=${apiCalls.length}`);
  console.log(`        right after click: ${JSON.stringify(immediately)}`);
  console.log(`        4s later         : ${JSON.stringify(after)}`);
}

ws.close();
browser.kill();
