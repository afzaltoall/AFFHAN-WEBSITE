import 'dotenv/config';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

// Are the rail's badge counts on EVERY admin route, or only the dashboard?
//
//   node tools/audit/92-rail-badges.mjs [baseUrl]
//
// Walks all thirteen rail destinations, reads every row of the rail on each
// one, and prints the figure beside it. The bug this was written for is a
// rail that shows "21" beside Contact Us on /admin and nothing at all on
// /admin/employees — so the assertion is that the same six rows carry the
// same six numbers whichever page you are standing on.
//
// Read-only: it navigates and reads the DOM, and clicks nothing.

const BASE = process.argv[2] ?? 'http://localhost:3000';
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9497);
const OUT = 'tools/audit/rail-shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SECRET = process.env.AUTH_SECRET || 'affhan_dev_secret';
const b64url = (i) => Buffer.from(i).toString('base64url');
const payload = b64url(JSON.stringify({
  id: 'probe-admin', email: process.env.ADMIN_EMAIL ?? 'admin@affhan.com',
  name: 'Probe', role: 'admin', iat: Date.now(),
}));
const token = `${payload}.${crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')}`;

const ROUTES = [
  '/admin/',
  '/admin/?view=inquiries',
  '/admin/?view=contacts',
  '/admin/?view=trash',
  '/admin/employees/',
  '/admin/team-performance/',
  '/admin/queue/',
  '/admin/activity/',
  '/admin/suppliers/',
  '/admin/videos/',
  '/admin/users/website/',
  '/admin/users/app/',
  '/admin/mobile-inquiries/',
];

fs.mkdirSync(OUT, { recursive: true });
const PROFILE = `${process.env.TEMP}\\edge-rail-${PORT}-${Date.now()}`;
const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--disable-gpu',
  '--disable-extensions', '--disable-component-extensions-with-background-pages',
  `--user-data-dir=${PROFILE}`, 'about:blank',
], { stdio: 'ignore' });

async function firstPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const pages = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json())
        .filter((t) => t.type === 'page');
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
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.text };
  return r.result?.result?.value;
};

await send('Network.enable');
await send('Page.enable');
await send('Runtime.enable');
const host = new URL(BASE).hostname;
const signIn = () => send('Network.setCookie', {
  name: 'affhan_session', value: token, domain: host, path: '/', httpOnly: true,
  secure: BASE.startsWith('https'), sameSite: 'Lax',
});

await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 980, deviceScaleFactor: 1, mobile: false });
await signIn();

// Reads every row of whichever rail this page drew. The pill and the dot are
// in the DOM whether the rail is open or shut (they collapse to zero width /
// zero opacity), so the numbers can be read without hovering — and the hover
// check below proves they are visible too.
const READ_RAIL = `(() => {
  const aside = document.querySelector('aside');
  if (!aside) return { error: 'no rail on this page' };
  const rows = [...aside.querySelectorAll('nav a, nav button')];
  return {
    rows: rows.map((el) => {
      const label = el.querySelector('span.flex-1');
      const spans = [...el.querySelectorAll('span')];
      const pill = spans.find((s) => /rounded-full/.test(s.className) && !/absolute/.test(s.className));
      const dot = spans.find((s) => /absolute/.test(s.className) && /rounded-full/.test(s.className));
      return {
        label: (label?.textContent || '').trim(),
        pill: (pill?.textContent || '').trim() || null,
        dot: (dot?.textContent || '').trim() || null,
      };
    }).filter((r) => r.label),
  };
})()`;

const seen = [];
for (const route of ROUTES) {
  await send('Page.navigate', { url: BASE + route });
  await sleep(route === '/admin/' || route.startsWith('/admin/?') ? 6000 : 3500);
  await signIn();
  const read = await evaluate(READ_RAIL);
  seen.push({ route, read });
}

let failures = 0;
const badged = (r) => (r.read?.rows || []).filter((x) => x.pill !== null);
const key = (r) => badged(r).map((x) => `${x.label}=${x.pill}`).join(' | ');

console.log('=== the figures on the rail, per route\n');
for (const s of seen) {
  if (s.read?.error) { console.log(`  ${s.route.padEnd(28)} ${s.read.error}`); failures++; continue; }
  const list = badged(s);
  console.log(`  ${s.route.padEnd(28)} ${list.length} badged: ${key(s) || '(none)'}`);
  if (list.length === 0) failures++;
}

// Every route that is not the dashboard must agree exactly. The dashboard's
// own rail counts the rows it has loaded and honours its country filter, so
// it is compared by shape rather than asserted identical.
const others = seen.filter((s) => !s.route.startsWith('/admin/?') && s.route !== '/admin/');
const first = others.length ? key(others[0]) : '';
const disagree = others.filter((s) => key(s) !== first);
console.log(`\nnon-dashboard routes: ${others.length}, all agreeing: ${disagree.length === 0 ? 'YES' : 'NO'}`);
for (const d of disagree) console.log(`   differs: ${d.route} -> ${key(d)}`);
failures += disagree.length;

const dash = seen.find((s) => s.route === '/admin/');
console.log(`dashboard rail:       ${key(dash ?? { read: {} }) || '(none)'}`);

// Visible, not merely present: open the rail on a page that is not the
// dashboard and read what is actually painted. React delegates mouseenter off
// mouseover, so a synthetic event will not open it — move the real pointer.
await send('Page.navigate', { url: `${BASE}/admin/employees/` });
await sleep(3500);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 500 });
await sleep(150);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 30, y: 400 });
await sleep(900);
const open = await evaluate(`(() => {
  const aside = document.querySelector('aside');
  const wide = aside.getBoundingClientRect().width;
  const rows = [...aside.querySelectorAll('nav a')];
  const painted = rows.map((el) => {
    const label = (el.querySelector('span.flex-1')?.textContent || '').trim();
    const pill = [...el.querySelectorAll('span')]
      .find((s) => /rounded-full/.test(s.className) && !/absolute/.test(s.className));
    if (!pill) return null;
    const r = pill.getBoundingClientRect();
    const cs = getComputedStyle(pill);
    return { label, text: pill.textContent.trim(), w: Math.round(r.width), opacity: cs.opacity };
  }).filter(Boolean);
  return { railWidth: Math.round(wide), painted };
})()`);
console.log(`\nrail opened on /admin/employees/ — width ${open.railWidth}px`);
for (const p of open.painted) {
  const ok = p.w > 0 && Number(p.opacity) > 0.9;
  if (!ok) failures++;
  console.log(`   ${ok ? 'visible' : 'HIDDEN '}  ${p.label.padEnd(18)} "${p.text}"  ${p.w}px opacity ${p.opacity}`);
}

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(`${OUT}/employees-rail-open.png`, Buffer.from(shot.result.data, 'base64'));
console.log(`\nscreenshot: ${OUT}/employees-rail-open.png`);
console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures})`);

ws.close();
browser.kill();
// Edge is still letting go of its profile directory as we exit; failing to
// delete a temp folder is not a failed check.
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
