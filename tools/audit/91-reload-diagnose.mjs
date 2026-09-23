import { spawn } from 'node:child_process';

// Why the reload leaves blank cards: does the rescue even run?
//
//   node tools/audit/91-reload-diagnose.mjs <url> [port]
//
// The IntersectionObserver rescue is in the shipped bundle and the reload is
// still blank, so the question is which of these is true: the observer never
// fires, it fires but flipping loading="eager" is ignored once Chrome has
// already deferred the image, or React never re-mounts the cards at all.

const url = process.argv[2] ?? 'http://localhost:3000/';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.argv[3] ?? 9780);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-rd-${PORT}-${Date.now()}`, 'about:blank',
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
const send = (m, p = {}) => new Promise((res) => { const k = ++id; pending.set(k, res); ws.send(JSON.stringify({ id: k, method: m, params: p })); });
const evalIn = async (x) => (await send('Runtime.evaluate', { returnByValue: true, expression: x })).result?.result?.value;

await send('Page.enable');
await send('Network.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

await send('Page.navigate', { url });
await sleep(11000);
await send('Page.reload');
await sleep(9000);

console.log(`${url} — state after reload\n`);
console.log('  navigation type   :', await evalIn(`(performance.getEntriesByType('navigation')[0]||{}).type`));
console.log('  react hydrated    :', await evalIn(`!!document.querySelector('[data-nimg]')`));
console.log('  blank imgs loading attr:', await evalIn(`(() => {
  const b = [...document.querySelectorAll('.hero-product-grid img')].filter(i => !i.complete);
  return b.slice(0,5).map(i => i.loading).join(',') + '  (' + b.length + ' incomplete)';
})()`));
console.log('  any eager among them   :', await evalIn(`[...document.querySelectorAll('.hero-product-grid img')].filter(i=>!i.complete && i.loading==='eager').length`));

// Does forcing it still work at this point?
await evalIn(`[...document.querySelectorAll('.hero-product-grid img')].forEach(i=>{
  const b=i.getBoundingClientRect();
  if (b.top<innerHeight && b.bottom>0 && !i.complete) i.loading='eager';
});`);
await sleep(5000);
console.log('  after manual eager     :', await evalIn(`(() => {
  const v=[...document.querySelectorAll('.hero-product-grid img')].filter(i=>{const b=i.getBoundingClientRect();return b.top<innerHeight&&b.bottom>0;});
  return v.filter(i=>i.complete&&i.naturalWidth>0).length + '/' + v.length + ' loaded';
})()`));

ws.close();
browser.kill();
