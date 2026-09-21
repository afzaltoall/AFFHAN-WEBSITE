import 'dotenv/config';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';

// What the Activity feed actually prints for a "Not attended", in a browser.
//
//   node tools/audit/94-activity-handoff-shot.mjs [baseUrl]
//
// 93-handoff-cases.mjs covers the endings live data does not have; this one
// proves the live one renders — that the line reads as a sentence, that the
// successor's name is a link to their page, and that the link inside the
// row's own stretched link does not swallow it.
//
// Read-only: navigates, reads and photographs. Clicks nothing.

const BASE = process.argv[2] ?? 'http://localhost:3000';
const EDGE = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9498);
const OUT = 'tools/audit/rail-shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SECRET = process.env.AUTH_SECRET || 'affhan_dev_secret';
const b64url = (i) => Buffer.from(i).toString('base64url');
const payload = b64url(JSON.stringify({
  id: 'probe-admin', email: process.env.ADMIN_EMAIL ?? 'admin@affhan.com',
  name: 'Probe', role: 'admin', iat: Date.now(),
}));
const token = `${payload}.${crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')}`;

fs.mkdirSync(OUT, { recursive: true });
const PROFILE = `${process.env.TEMP}\\edge-act-${PORT}-${Date.now()}`;
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
await send('Network.setCookie', {
  name: 'affhan_session', value: token, domain: host, path: '/', httpOnly: true,
  secure: BASE.startsWith('https'), sameSite: 'Lax',
});
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

await send('Page.navigate', { url: `${BASE}/admin/activity/` });
await sleep(6000);

const read = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('ol > li')];
  return rows.map((li) => {
    const p = li.querySelector('p');
    const links = [...li.querySelectorAll('a')].map((a) => ({
      text: (a.textContent || '').trim(),
      href: a.getAttribute('href'),
    }));
    return { line: (p?.textContent || '').replace(/\\s+/g, ' ').trim(), links };
  });
})()`);

let failures = 0;
console.log('=== /admin/activity/\n');
if (read.error || !Array.isArray(read)) { console.log('  could not read the feed:', JSON.stringify(read)); failures++; }
else if (read.length === 0) { console.log('  the feed is empty — nothing to check'); failures++; }
else {
  for (const row of read) {
    console.log(`  ${row.line}`);
    for (const l of row.links) console.log(`      link: "${l.text}" -> ${l.href}`);
    if (/Not attended/.test(row.line)) {
      const hasTail = /→/.test(row.line);
      const named = row.links.some((l) => /^\/admin\/employees\//.test(l.href || ''));
      if (!hasTail) { console.log('      FAIL: no "→ ..." after the chip'); failures++; }
      // Two employee links on a handed-on row: the recorder and the successor.
      const empLinks = row.links.filter((l) => /^\/admin\/employees\//.test(l.href || ''));
      if (hasTail && /passed to/.test(row.line) && empLinks.length < 2) {
        console.log(`      FAIL: the successor is not a link (${empLinks.length} employee links)`);
        failures++;
      }
      if (!named) { console.log('      FAIL: no employee link at all'); failures++; }
    }
  }
}

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(`${OUT}/activity-handoff.png`, Buffer.from(shot.result.data, 'base64'));
console.log(`\nscreenshot: ${OUT}/activity-handoff.png`);
console.log(failures === 0 ? '\nPASS' : `\nFAIL (${failures})`);

ws.close();
browser.kill();
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
