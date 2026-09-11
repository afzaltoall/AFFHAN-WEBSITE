import { spawn } from 'node:child_process';

// Compare a page rendered normally against the same page in forced-colors
// (Windows High Contrast) mode.
//
//   node tools/audit/52-forced-colors-probe.mjs <url>
//
// Reports computed styles rather than a screenshot, so "the cards have black
// boxes round them" becomes a value that can be asserted. In forced-colors the
// browser replaces author colours with the system palette and strips background
// images, which is exactly what a report of "boxes appeared and the pictures
// went" looks like.

const url = process.argv[2] ?? 'http://localhost:3002/';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9771);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--disable-gpu',
  `--user-data-dir=${process.env.TEMP}/edge-fc-${Date.now()}`, 'about:blank',
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
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

const PROBE = `(() => {
  const card = document.querySelector('.liquid-glass-card')
            || document.querySelector('[class*="rounded-2xl"]')
            || document.querySelector('article, .group');
  const btn = [...document.querySelectorAll('a,button')].find(e => /Inquire/i.test(e.textContent || ''));
  const img = document.images[0];
  const cs = card ? getComputedStyle(card) : null;
  return {
    forcedColors: matchMedia('(forced-colors: active)').matches,
    cardBorderTop: cs ? cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor : null,
    cardBackground: cs ? cs.backgroundColor : null,
    buttonColor: btn ? getComputedStyle(btn).color : null,
    buttonBorder: btn ? getComputedStyle(btn).borderTopWidth + ' ' + getComputedStyle(btn).borderTopColor : null,
    firstImageLoaded: img ? (img.complete && img.naturalWidth > 0) : null,
  };
})()`;

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 440, height: 956, deviceScaleFactor: 2, mobile: true });

for (const forced of [false, true]) {
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'forced-colors', value: forced ? 'active' : 'none' }],
  });
  await send('Page.navigate', { url });
  await sleep(9000);
  const r = await send('Runtime.evaluate', { returnByValue: true, expression: PROBE });
  console.log((forced ? 'FORCED-COLORS ACTIVE' : 'NORMAL              ') + '  ' + JSON.stringify(r.result?.result?.value));
}

ws.close();
browser.kill();
