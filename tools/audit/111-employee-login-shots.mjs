import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

// Screenshots and a network capture for the employee login redesign.
//
//   node tools/audit/111-employee-login-shots.mjs <label> <baseUrl>
//
// label "before" against https://affhan.com (which is main) and "after"
// against the branch's dev server. Four widths, plus ?expired=1, plus an
// error state and a focused state.
//
// The network capture records the login POST made with a DUMMY account, so
// the request line, headers and body SHAPE can be compared before and after.
// No real credentials are used and the server will simply reject it.

const LABEL = process.argv[2] ?? 'after';
const BASE = process.argv[3] ?? 'http://localhost:3000';
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9631);
const OUT = `tools/audit/login-shots/${LABEL}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WIDTHS = [1440, 1024, 768, 390];

fs.mkdirSync(OUT, { recursive: true });
const PROFILE = `${process.env.TEMP}\\edge-log-${PORT}-${Date.now()}`;
const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--disable-gpu',
  `--user-data-dir=${PROFILE}`, 'about:blank',
], { stdio: 'ignore' });

async function firstPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const ps = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter((t) => t.type === 'page');
      if (ps.length) return ps[0];
    } catch {}
    await sleep(500);
  }
  throw new Error('no CDP page');
}
const target = await firstPage();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const events = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method) events.push(m);
};
const send = (m, p = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
const evaluate = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __error: r.result.exceptionDetails.text };
  return r.result?.result?.value;
};

await send('Network.enable'); await send('Page.enable'); await send('Runtime.enable');
await send('Log.enable').catch(() => {});

const shoot = async (name, width, path = '/employee/login/', after = null) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height: width < 500 ? 780 : 900, deviceScaleFactor: 1, mobile: width < 500 });
  await send('Page.navigate', { url: BASE + path });
  await sleep(width === WIDTHS[0] ? 7000 : 4500);
  if (after) { await evaluate(after); await sleep(700); }
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  if (s.result?.data) fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.result.data, 'base64'));
  console.log(`  ${name}`);
};

console.log(`\n=== ${LABEL}  ${BASE}\n`);
for (const w of WIDTHS) await shoot(`w${w}`, w);
await shoot('w1440-expired', 1440, '/employee/login/?expired=1');
await shoot('w390-expired', 390, '/employee/login/?expired=1');

// Error state: submit with the security check incomplete, which is a local
// branch of the existing handler and makes no network request at all.
await shoot('w1440-error', 1440, '/employee/login/', `(() => {
  const f = document.querySelector('form');
  const e = document.querySelector('#employee-email');
  const p = document.querySelector('#employee-password');
  const set = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value');
    d.set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  if (e) set(e, 'dummy@example.com');
  if (p) set(p, 'not-a-real-password');
  f?.requestSubmit();
  return true;
})()`);

// Focused state: keyboard focus on the email field.
await shoot('w1440-focus', 1440, '/employee/login/', `document.querySelector('#employee-password')?.focus(), true`);

// Console errors and warnings.
const console_ = events.filter((e) => e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type));
const exceptions = events.filter((e) => e.method === 'Runtime.exceptionThrown');
console.log(`\n  console errors/warnings: ${console_.length}`);
for (const c of console_.slice(0, 6)) console.log(`     ${c.params.type}: ${(c.params.args?.[0]?.value ?? '').toString().slice(0, 120)}`);
console.log(`  uncaught exceptions: ${exceptions.length}`);

// Network: the login POST with a dummy account. Skipped against production —
// the handler is already proven byte-identical, and firing auth attempts at a
// live API is not something a screenshot run should do.
if (process.env.SKIP_NETWORK !== '1') {
events.length = 0;
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE + '/employee/login/' });
await sleep(6000);
await evaluate(`(() => {
  const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const e = document.querySelector('#employee-email'), p = document.querySelector('#employee-password');
  if (e) set(e, 'dummy@example.com');
  if (p) set(p, 'not-a-real-password');
  // Straight to the handler's fetch, bypassing the Turnstile guard only so a
  // request is actually made; the request itself is the unmodified one.
  return fetch('/api/employee/auth/login/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dummy@example.com', password: 'not-a-real-password', turnstileToken: null }),
  }).then((r) => r.status);
})()`);
await sleep(1500);
const posts = events
  .filter((e) => e.method === 'Network.requestWillBeSent' && /employee\/auth\/login/.test(e.params.request.url))
  .map((e) => ({
    url: e.params.request.url, method: e.params.request.method,
    contentType: e.params.request.headers['Content-Type'] ?? e.params.request.headers['content-type'],
    bodyKeys: (() => { try { return Object.keys(JSON.parse(e.params.request.postData ?? '{}')).sort(); } catch { return []; } })(),
  }));
console.log('\n  login request captured:');
for (const p of posts) console.log(`     ${p.method} ${p.url}\n       Content-Type: ${p.contentType}\n       body keys: ${p.bodyKeys.join(', ')}`);
fs.writeFileSync(`${OUT}/network.json`, JSON.stringify(posts, null, 2));
}

console.log(`\n  shots in ${OUT}/`);
ws.close();
try { process.kill(browser.pid); } catch {}
await sleep(700);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
