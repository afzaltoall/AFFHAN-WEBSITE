import { spawn } from 'node:child_process';

// Do the product images load, and become visible, on a RELOAD?
//
//   node tools/audit/90-reload-images.mjs <url> [port]
//
// The bug this exists for: the homepage looks right on a first visit and comes
// back with blank cards on every reload after it. Measured at 1440x900, 11
// product images in the viewport — 45 image requests on the first load, 9 on
// the reload, and one visible card.
//
// It is two faults stacked, and a check for either one alone passes:
//
//   1. Chrome never requests the loading="lazy" images on a reload. They sit
//      in the viewport with complete === false and an empty currentSrc.
//      Setting loading = "eager" loads all 11 at once.
//   2. Images that DO arrive finish from cache before React attaches its
//      onLoad handler, so the fade-in never runs and a fully downloaded image
//      stays at opacity 0.
//
// So this reports loaded and visible separately. An earlier check looked only
// at naturalWidth, reported a healthy page, and missed the whole thing.

const url = process.argv[2] ?? 'http://localhost:3000/';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.argv[3] ?? process.env.CDP_PORT ?? 9770);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-rl-${PORT}-${Date.now()}`, 'about:blank',
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
let imgReq = 0;
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Network.requestWillBeSent' && m.params.type === 'Image') imgReq++;
};
const send = (m, p = {}) => new Promise((res) => { const k = ++id; pending.set(k, res); ws.send(JSON.stringify({ id: k, method: m, params: p })); });
const evalIn = async (x) => (await send('Runtime.evaluate', { returnByValue: true, expression: x })).result?.result?.value;

await send('Page.enable');
await send('Network.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

const STATE = `(() => {
  const all = [...document.querySelectorAll('.hero-product-grid img')];
  const inView = all.filter((i) => { const b = i.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0; });
  return {
    inView: inView.length,
    loaded: inView.filter((i) => i.complete && i.naturalWidth > 0).length,
    visible: inView.filter((i) => parseFloat(getComputedStyle(i).opacity) > 0.9).length,
  };
})()`;

const line = async (label) => {
  const s = await evalIn(STATE);
  const ok = s.inView > 0 && s.loaded === s.inView && s.visible === s.inView;
  console.log('  ' + label.padEnd(26) + `${s.inView} in view / ${s.loaded} loaded / ${s.visible} visible` +
    `   ${imgReq} img reqs   ` + (ok ? 'OK' : '<<< BLANK CARDS'));
  imgReq = 0;
  return ok;
};

console.log(`${url}  (1440x900)\n`);
await send('Page.navigate', { url });
await sleep(11000);
let allOk = await line('1. first load');
for (const n of [2, 3, 4]) {
  await send('Page.reload');
  await sleep(9000);
  allOk = (await line(`${n}. reload`)) && allOk;
}
console.log('\n  ' + (allOk ? 'PASS — every load shows every in-view image' : 'FAIL — at least one load left blank cards'));

ws.close();
browser.kill();
process.exit(allOk ? 0 : 1);
