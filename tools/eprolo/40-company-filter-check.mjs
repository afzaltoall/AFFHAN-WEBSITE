import 'dotenv/config';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

// Does the rebuilt Company filter actually filter?
//
//   node tools/eprolo/40-company-filter-check.mjs
//
// Reads the two rows the section now offers, clicks each, and counts the
// message rows left behind. A dropdown that renders the right labels but
// filters nothing looks identical in a screenshot, so the row count is the
// part worth asserting.

const BASE = process.argv[2] ?? 'http://localhost:3000';
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9495);
const OUT = 'tools/eprolo/moderation/dropdown-shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SECRET = process.env.AUTH_SECRET || 'affhan_dev_secret';
const b64url = (i) => Buffer.from(i).toString('base64url');
const payload = b64url(JSON.stringify({
  id: 'probe-admin', email: process.env.ADMIN_EMAIL ?? 'admin@affhan.com',
  name: 'Probe', role: 'admin', iat: Date.now(),
}));
const token = `${payload}.${crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')}`;

fs.mkdirSync(OUT, { recursive: true });
const PROFILE = `${process.env.TEMP}\\edge-cf-${PORT}-${Date.now()}`;
const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run', '--disable-gpu',
  '--disable-extensions', '--disable-component-extensions-with-background-pages',
  `--user-data-dir=${PROFILE}`, 'about:blank',
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
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
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

await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
await signIn();
await send('Page.navigate', { url: `${BASE}/admin/` });
await sleep(300);
await signIn();
await sleep(5500);

// Count the message rows. Each row carries the sender's email, which is the
// most reliable per-row marker in this table.
const COUNT = `document.querySelectorAll('button[aria-label="Select message"]').length`;

const result = await evaluate(`(async () => {
  const out = {};
  const open = async () => {
    const b = [...document.querySelectorAll('button[aria-haspopup="menu"]')].find(x => /Filter/i.test(x.textContent||''));
    b.click();
    await new Promise(r => setTimeout(r, 600));
    return document.querySelector('[role="menu"]');
  };
  const nav = document.querySelector('button[title="Contact Us"]');
  if (!nav) return { error: 'no Contact Us nav', at: location.pathname, btns: [...document.querySelectorAll('button')].map(b=>(b.textContent||'').trim().slice(0,25)).filter(Boolean).slice(0,12) };
  nav.click();
  await new Promise(r => setTimeout(r, 2200));

  out.rowsBefore = ${COUNT};

  let panel = await open();
  if (!panel) return { error: 'panel did not open' };

  // Everything under the COMPANY heading.
  const rows = [...panel.querySelectorAll('[role="menuitemradio"]')].map(b => (b.textContent||'').trim().replace(/\\s+/g,' '));
  out.allMenuRows = rows;
  const companyRows = rows.slice(4); // the four STATUS rows come first
  out.companyRows = companyRows;

  const hasCompany = [...panel.querySelectorAll('[role="menuitemradio"]')]
    .find(b => /Has a company name/i.test(b.textContent||''));
  if (!hasCompany) return { ...out, error: 'no "Has a company name" row' };
  out.hasCompanyLabel = hasCompany.textContent.trim().replace(/\\s+/g,' ');
  hasCompany.click();
  await new Promise(r => setTimeout(r, 1200));
  out.rowsWithCompany = ${COUNT};

  panel = await open();
  const allRow = [...panel.querySelectorAll('[role="menuitemradio"]')].slice(4)
    .find(b => /^All/i.test((b.textContent||'').trim()));
  if (!allRow) return { ...out, error: 'no company "All" row' };
  allRow.click();
  await new Promise(r => setTimeout(r, 1200));
  out.rowsAfterAll = ${COUNT};

  // Leave it open on the company section for the screenshot.
  await open();
  return out;
})()`);

console.log(JSON.stringify(result, null, 2));

const shot = await send('Page.captureScreenshot', { format: 'png' });
if (shot.result?.data) {
  fs.writeFileSync(`${OUT}/company-filter.png`, Buffer.from(shot.result.data, 'base64'));
  console.log(`screenshot -> ${OUT}/company-filter.png`);
}

ws.close();
browser.kill();
await sleep(600);
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
