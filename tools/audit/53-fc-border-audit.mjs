import { spawn } from 'node:child_process';

// Which elements actually gain a visible border in forced-colors?
//
//   node tools/audit/53-fc-border-audit.mjs <url>
//
// Guessing which decorative borders become boxes in High Contrast is how the
// first attempt at this missed the "Inquire Now" button: the card wrapper was
// fixed, the button inside it was not. This walks the rendered page in both
// modes and lists every class combination whose border-style is none-or-
// invisible normally but paints in forced-colors, ranked by how many elements
// share it — so the CSS fix targets what is actually wrong.

const url = process.argv[2] ?? 'https://affhan.com/';
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9781);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--disable-gpu',
  `--user-data-dir=${process.env.TEMP}/edge-fcb-${Date.now()}`, 'about:blank',
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

// Collect, per element, whether it paints a border and what its classes are.
const COLLECT = `(() => {
  const out = {};
  for (const el of document.querySelectorAll('div,button,span,a')) {
    const cs = getComputedStyle(el);
    const w = parseFloat(cs.borderTopWidth) || 0;
    if (w === 0 || cs.borderTopStyle === 'none') continue;
    // Only things that actually paint. getComputedStyle happily reports a
    // border on a display:none element, which made the bead field look
    // unfixed after it had been hidden — 721 phantom entries.
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const c = cs.borderTopColor;
    // alpha, and how close to the element's own background it is
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    const parts = m ? m[1].split(',').map(Number) : [0,0,0,1];
    const alpha = parts.length > 3 ? parts[3] : 1;
    const nearWhite = parts[0] > 230 && parts[1] > 230 && parts[2] > 230;
    const key = (el.className || '').toString().split(/\\s+/)
      .filter(x => /^(border|shadow|bg-white|ring)/.test(x)).sort().join(' ') || '(no border utility)';
    out[key] = out[key] || { n: 0, tag: el.tagName.toLowerCase(), alpha, nearWhite, color: c };
    out[key].n++;
  }
  return out;
})()`;

const snap = {};
for (const forced of [false, true]) {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: forced ? 'active' : 'none' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 440, height: 956, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url });
  await sleep(10000);
  const r = await send('Runtime.evaluate', { returnByValue: true, expression: COLLECT });
  snap[forced ? 'forced' : 'normal'] = r.result?.result?.value ?? {};
}

console.log('Elements painting a border in FORCED-COLORS, by class signature:\n');
const rows = Object.entries(snap.forced)
  .map(([k, v]) => ({ key: k, ...v, normal: snap.normal[k] }))
  .sort((a, b) => b.n - a.n);
for (const r of rows.slice(0, 14)) {
  const was = r.normal ? `was ${r.normal.color}${r.normal.nearWhite ? '  <-- INVISIBLE NORMALLY' : ''}` : 'no border normally';
  console.log(`  ${String(r.n).padStart(4)}x  <${r.tag}>  ${r.key.slice(0, 62)}`);
  console.log(`         ${was}`);
}

ws.close();
browser.kill();
