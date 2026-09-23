import { spawn } from 'node:child_process';

// Cold FCP and LCP, N runs, one fresh browser each.
//
//   node tools/audit/89-fcp-lcp.mjs <url> [runs]
//
// Needed because the inlineCss simulation in 86/87 replaced the stylesheet
// <link> with a single <style> block, and the real Next implementation does
// not do that: it emits the CSS in a <style> AND twice more inside the RSC
// payload, so the document carries three copies. The simulated saving is not
// the shipped saving, and only the built artefact can say which way it lands.
//
// One browser per run: navigating twice in the same browser serves from memory
// cache and reports FCP 0, which reads as a perfect score and measures nothing.

const url = process.argv[2] ?? 'http://localhost:3000/';
const RUNS = Number(process.argv[3] ?? 5);
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE_PORT = Number(process.env.CDP_PORT ?? 9630);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function once(port) {
  const browser = spawn(EDGE, [
    `--remote-debugging-port=${port}`, '--headless=new', '--no-first-run',
    `--user-data-dir=${process.env.TEMP}/edge-fl-${port}-${Date.now()}`, 'about:blank',
  ], { stdio: 'ignore' });

  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    try {
      const p = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter((t) => t.type === 'page');
      if (p.length) target = p[0];
    } catch {}
    if (!target) await sleep(500);
  }
  if (!target) { browser.kill(); throw new Error('no CDP page'); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  let docBytes = 0, cssBytes = 0, imgBytes = 0, total = 0;
  const types = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Network.requestWillBeSent') types.set(m.params.requestId, m.params.type);
    if (m.method === 'Network.loadingFinished') {
      const t = types.get(m.params.requestId);
      const b = m.params.encodedDataLength;
      total += b;
      if (t === 'Document') docBytes += b;
      if (t === 'Stylesheet') cssBytes += b;
      if (t === 'Image') imgBytes += b;
    }
  };
  const send = (m, p = {}) => new Promise((res) => { const k = ++id; pending.set(k, res); ws.send(JSON.stringify({ id: k, method: m, params: p })); });

  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
  });
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.__fcp=0;window.__lcp=0;try{new PerformanceObserver(function(l){var e=l.getEntries();for(var i=0;i<e.length;i++){if(e[i].name==="first-contentful-paint")window.__fcp=Math.round(e[i].startTime);}}).observe({type:"paint",buffered:true});new PerformanceObserver(function(l){var e=l.getEntries();for(var i=0;i<e.length;i++){window.__lcp=Math.round(e[i].startTime);}}).observe({type:"largest-contentful-paint",buffered:true});}catch(e){}',
  });

  await send('Page.navigate', { url });
  await sleep(17000);
  const got = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: '({fcp:window.__fcp,lcp:window.__lcp,picked:(document.querySelector(".hero-product-grid img")||{}).currentSrc||""})',
  });
  const v = (got.result && got.result.result && got.result.result.value) || {};
  ws.close();
  browser.kill();
  return { ...v, docKb: Math.round(docBytes / 1024), cssKb: Math.round(cssBytes / 1024), imgKb: Math.round(imgBytes / 1024), totalKb: Math.round(total / 1024) };
}

const widthOf = (u) => {
  const b64 = String(u).split('cloudfront.net/')[1];
  if (!b64) return '?';
  try {
    const j = JSON.parse(Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return (j.edits && j.edits.resize && j.edits.resize.width) || '?';
  } catch { return '?'; }
};

const rows = [];
for (let i = 0; i < RUNS; i++) rows.push(await once(BASE_PORT + i));
const med = (k) => { const s = rows.map((r) => r[k]).sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

console.log(`${url}   ${RUNS} cold runs, 4x CPU, 1.6Mbps/150ms\n`);
console.log('  run   FCP    LCP   doc kB  css kB  img kB  total kB');
console.log('  ' + '-'.repeat(56));
rows.forEach((r, i) => console.log('  ' + String(i + 1).padStart(3) + String(r.fcp).padStart(6) + String(r.lcp).padStart(7) +
  String(r.docKb).padStart(9) + String(r.cssKb).padStart(8) + String(r.imgKb).padStart(8) + String(r.totalKb).padStart(10)));
console.log('  ' + '-'.repeat(56));
console.log('  med' + String(med('fcp')).padStart(6) + String(med('lcp')).padStart(7) +
  String(med('docKb')).padStart(9) + String(med('cssKb')).padStart(8) + String(med('imgKb')).padStart(8) + String(med('totalKb')).padStart(10));
console.log(`\n  srcset picked width: ${widthOf(rows[0].picked)}px`);
