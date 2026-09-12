import { spawn } from 'node:child_process';

// Does the main thread ever go idle under LIGHTHOUSE's conditions?
//
//   node tools/audit/57-lighthouse-conditions.mjs <url> <label>
//
// Every earlier probe here ran unthrottled desktop and reported the page quiet.
// Lighthouse does not: it emulates a mid-tier phone with a 4x CPU slowdown, so
// work that measures 5ms locally costs 20ms there. Its waitForCpuIdle wants a
// window with no main-thread task longer than 50ms; under 4x that threshold is
// crossed by things that look free on a desktop.
//
// This reproduces those conditions and reports the longest quiet gap actually
// achieved, which is the number Lighthouse is failing on.

const url = process.argv[2];
const label = process.argv[3] ?? url;
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9971);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}/edge-lh-${Date.now()}`, 'about:blank',
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

await send('Page.enable');
await send('Runtime.enable');
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__t=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__t.push([Math.round(e.startTime),Math.round(e.duration)]);}).observe({type:'longtask',buffered:true});}catch(e){}`,
});

// Lighthouse mobile defaults.
await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });

const t0 = Date.now();
await send('Page.navigate', { url });
await sleep(30000);

const r = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const t = (window.__t || []).slice().sort((a,b)=>a[0]-b[0]);
    // longest gap between the end of one long task and the start of the next
    let best = 0, prevEnd = 0, lastEnd = 0;
    for (const [start, dur] of t) {
      if (start - prevEnd > best) best = start - prevEnd;
      prevEnd = Math.max(prevEnd, start + dur);
      lastEnd = prevEnd;
    }
    const since = Math.round(performance.now()) - lastEnd;
    return {
      longTasks: t.length,
      totalBlockingMs: t.reduce((a,[,d])=>a+Math.max(0,d-50),0),
      longestTaskMs: t.length ? Math.max(...t.map(x=>x[1])) : 0,
      lastLongTaskEndedAtMs: lastEnd,
      longestGapBetweenLongTasksMs: best,
      quietSinceLastTaskMs: since,
      imgs: document.images.length,
    };
  })()`,
});

console.log(`${label}`);
console.log('  ' + JSON.stringify(r.result?.result?.value, null, 1).replace(/\n/g, '\n  '));
ws.close();
browser.kill();
