import { spawn } from 'node:child_process';

// Does the selected category tile actually LOOK selected?
//
//   node tools/audit/50-selected-state-probe.mjs <categoryId>
//
// It has to be a real browser. /products reads ?categoryId= from
// window.location in an effect — deliberately, so a deep link does not hydrate
// as a different view than the server sent — which means the server HTML never
// contains the selected state and curl can never see it. The tick and the ring
// only exist after hydration.
//
// Reports the computed styles rather than a screenshot, so the answer is a
// value that can be asserted instead of a picture someone has to squint at.

const catId = process.argv[2];
if (!catId) { console.error('usage: 50-selected-state-probe.mjs <categoryId>'); process.exit(1); }

const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9731);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROFILE = `${process.env.TEMP}\\edge-sel-${PORT}-${Date.now()}`;

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--disable-gpu',
  '--disable-extensions', `--user-data-dir=${PROFILE}`, 'about:blank',
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
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) =>
  new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://localhost:3000/products/?categoryId=${encodeURIComponent(catId)}` });
await sleep(11000);

const probe = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const sel = [...document.querySelectorAll('button[aria-current="true"]')];
    const all = [...document.querySelectorAll('button')].filter(b => b.querySelector('img,svg'));
    if (!sel.length) return { selectedTiles: 0, totalTiles: all.length };
    const t = sel[0];
    const circle = t.querySelector('div > div') || t.querySelector('div');
    const cs = getComputedStyle(circle);
    const tick = t.querySelector('span.rounded-full.bg-brand, span[class*="bg-brand"]');
    return {
      selectedTiles: sel.length,
      totalTiles: all.length,
      label: (t.textContent || '').trim().slice(0, 40),
      borderColor: cs.borderColor,
      borderWidth: cs.borderWidth,
      boxShadow: cs.boxShadow.slice(0, 80),
      tickPresent: !!tick,
      tickBg: tick ? getComputedStyle(tick).backgroundColor : null,
    };
  })()`,
});

console.log(JSON.stringify(probe.result?.result?.value, null, 1));
ws.close();
browser.kill();
