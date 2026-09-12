import { spawn } from 'node:child_process';

// Which width does a product card actually download, per viewport?
//
//   node tools/audit/92-srcset-pick.mjs <url> [port]
//
// Samples a NON-priority card: the priority one keeps a single 400px source
// on purpose (it is the LCP candidate and keeps next/image's preload), so
// reading the first card in the grid measures the wrong thing.
//
// The bar is that no device may end up with MORE bytes than the fixed 400px
// this replaced. An earlier candidate list went up to 540 and every retina
// device chose it.

const url = process.argv[2] ?? 'http://localhost:3000/';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.argv[3] ?? 9880);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const widthOf = (u) => {
  const b64 = String(u).split('cloudfront.net/')[1];
  if (!b64) return '?';
  try {
    const j = JSON.parse(Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return (j.edits && j.edits.resize && j.edits.resize.width) || '?';
  } catch { return '?'; }
};

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-sp-${PORT}-${Date.now()}`, 'about:blank',
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
await send('Network.setCacheDisabled', { cacheDisabled: true });

console.log(`${url}\n`);
console.log('  viewport'.padEnd(22) + 'card CSS'.padStart(10) + 'picked'.padStart(9) + '   vs the old fixed 400px');
console.log('  ' + '-'.repeat(66));
let regressed = false;
for (const [label, w, h, dpr, mobile] of [
  ['phone 412 @2x', 412, 823, 2, true],
  ['phone 412 @3x', 412, 823, 3, true],
  ['tablet 768 @2x', 768, 1024, 2, true],
  ['laptop 1440 @1x', 1440, 900, 1, false],
  ['laptop 1440 @2x', 1440, 900, 2, false],
  ['wide 1920 @1x', 1920, 1080, 1, false],
]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 });
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await send('Page.navigate', { url });
  await sleep(9000);
  const r = await evalIn(`(() => {
    const i = [...document.querySelectorAll('.hero-product-grid img')].find(x => x.srcset);
    if (!i) return null;
    const b = i.getBoundingClientRect();
    return { src: i.currentSrc || i.src, w: Math.round(b.width) };
  })()`);
  if (!r) { console.log('  ' + label.padEnd(20) + '  (no srcset card found)'); continue; }
  const picked = widthOf(r.src);
  if (typeof picked === 'number' && picked > 400) regressed = true;
  const verdict = picked === 400 ? 'same' : picked < 400 ? `smaller (-${400 - picked}px)` : `LARGER — regression`;
  console.log('  ' + label.padEnd(20) + String(r.w).padStart(10) + String(picked + 'px').padStart(9) + '   ' + verdict);
}
console.log('\n  ' + (regressed ? 'FAIL — some device now downloads more than before' : 'PASS — no device downloads more than the old fixed 400px'));

ws.close();
browser.kill();
process.exit(regressed ? 1 : 0);
