import { spawn } from 'node:child_process';

// How many elements are asking for their own compositor layer, at rest.
//
//   node tools/audit/72-layer-count.mjs <url>
//
// The direct check on B1: will-change promotes an element whether or not
// anything is animating, so counting elements whose computed will-change is
// not `auto` says what the page is actually costing the compositor before
// anyone hovers anything.

const url = process.argv[2] ?? 'http://localhost:3000/';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9451);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-lc2-${Date.now()}`, 'about:blank',
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
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
// setDeviceMetricsOverride alone does NOT change the hover/pointer media
// features - headless Chrome keeps reporting (hover: hover) and (pointer:
// fine) until touch emulation is on. Without this the probe measures the
// desktop code path while claiming to be a phone.
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
await send('Page.navigate', { url });
await sleep(12000);

const r = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const byClass = {};
    let n = 0;
    for (const el of document.querySelectorAll('*')) {
      const wc = getComputedStyle(el).willChange;
      if (!wc || wc === 'auto') continue;
      n++;
      const k = (el.className && String(el.className).split(' ')[0]) || el.tagName;
      byClass[k] = (byClass[k] || 0) + 1;
    }
    // Animations that are actually playing, as opposed to merely declared.
    let running = 0, paused = 0;
    for (const a of document.getAnimations()) (a.playState === 'running' ? running++ : paused++);
    return { willChange: n, byClass, running, paused,
             hoverCapable: matchMedia('(hover: hover) and (pointer: fine)').matches,
             elements: document.getElementsByTagName('*').length,
             images: document.images.length,
             beads: document.querySelectorAll('[class*="b2b-bead"]').length };
  })()`,
});
console.log(url);
console.log(JSON.stringify(r.result?.result?.value, null, 1));

ws.close();
browser.kill();
