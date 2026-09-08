import 'dotenv/config';
import { spawn } from 'node:child_process';
import { splitHeroPoolCheck } from './_split-check.mjs';

// Verifies the homepage rotation work in a real browser.
//
// The shuffle runs in useEffect, deliberately — the first client render has to
// match the server HTML or React reports a hydration mismatch. That means
// fetching the HTML with curl proves nothing: it only ever shows the server
// order. This drives headless Edge over CDP so the effects actually run, then
// reads the DOM.
//
// ProductCard renders <Link aria-label={product.name}>, which is the stable
// handle for "which products are on screen".

const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9333);
const URL = process.env.HOME_URL ?? 'http://localhost:3000/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 1. structural: the three slices cannot overlap ----
console.log('=== 1. SECTION OVERLAP (structural) ===');
splitHeroPoolCheck();

// ---- 2. browser ----
const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`,
  '--headless=new', '--no-first-run', '--disable-gpu',
  `--user-data-dir=${process.env.TEMP}\\edge-rotation-${PORT}`,
  'about:blank',
], { stdio: 'ignore' });

async function firstPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const pages = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json())
        .filter((t) => t.type === 'page');
      if (pages.length) return pages[0];
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('Edge did not expose a CDP page');
}

const target = await firstPage();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text);
};
const send = (method, params = {}) =>
  new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');

const READ = `(() => {
  const names = (root) => [...root.querySelectorAll('a[aria-label]')]
    .map(a => a.getAttribute('aria-label')).filter(Boolean);
  const popular = document.querySelector('#popular-products');
  const all = names(document);
  return {
    all,
    popular: popular ? names(popular) : [],
    gridCards: document.querySelectorAll('a[aria-label]').length,
  };
})()`;

const runs = [];
for (let i = 1; i <= 3; i++) {
  errors.length = 0;
  await send('Page.navigate', { url: URL });
  await sleep(9000);
  const r = await send('Runtime.evaluate', { expression: READ, returnByValue: true, awaitPromise: true });
  const data = r.result?.result?.value ?? { all: [], popular: [], gridCards: 0 };
  runs.push({ data, errors: [...errors] });
  console.log(`\nrefresh ${i}: ${data.all.length} product links in DOM`);
  console.log(`  first 3: ${data.all.slice(0, 3).map((n) => n.slice(0, 42)).join(' | ')}`);
}

console.log('\n=== 2. VARIETY ACROSS REFRESHES ===');
let allIdentical = true;
for (let i = 0; i < 3; i++) {
  for (let j = i + 1; j < 3; j++) {
    const a = new Set(runs[i].data.all), b = new Set(runs[j].data.all);
    const shared = [...a].filter((x) => b.has(x)).length;
    const identical = a.size === b.size && shared === a.size;
    if (!identical) allIdentical = false;
    console.log(`  refresh ${i + 1} vs ${j + 1}: ${shared}/${a.size} shared` +
      ` (${a.size ? ((shared / a.size) * 100).toFixed(0) : 0}% overlap)  identical: ${identical}`);
  }
}

console.log('\n=== 3. HYDRATION ===');
const hyd = runs.flatMap((r) => r.errors).filter((e) => /hydrat|did not match|Text content does not match/i.test(e));
console.log(`  hydration mismatch errors: ${hyd.length}`);
for (const h of hyd.slice(0, 3)) console.log(`    ${h.slice(0, 160)}`);
const other = runs.flatMap((r) => r.errors).filter((e) => !/hydrat|did not match/i.test(e));
console.log(`  other console errors: ${other.length}`);
for (const o of other.slice(0, 4)) console.log(`    ${o.slice(0, 160)}`);

const pass = !allIdentical && hyd.length === 0 && runs.every((r) => r.data.all.length > 0);
console.log(`\n${pass ? 'PASS' : 'FAIL'} — variety across refreshes: ${!allIdentical}, hydration clean: ${hyd.length === 0}`);

ws.close();
browser.kill();
process.exit(pass ? 0 : 1);
