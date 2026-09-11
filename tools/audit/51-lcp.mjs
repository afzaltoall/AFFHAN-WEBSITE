import { spawn } from 'node:child_process';
// Measure LCP for a URL in headless Edge.
//   node tools/audit/51-lcp.mjs <url> <label>
const [url, label] = process.argv.slice(2);
// Forward slashes deliberately: Windows accepts them, and a single-backslash
// path written through a shell heredoc becomes "C:Program Files…" because JS
// eats \P, \M, \E and \A as escape sequences.
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = Number(process.env.CDP_PORT ?? 9755);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = spawn(EDGE, [`--remote-debugging-port=${PORT}`, '--headless=new', '--no-first-run',
  '--disable-gpu', `--user-data-dir=${process.env.TEMP}\edge-lcp-${Date.now()}`, 'about:blank'], { stdio: 'ignore' });
async function firstPage(){ for(let i=0;i<40;i++){ try{ const p=(await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).filter(t=>t.type==='page'); if(p.length) return p[0]; }catch{} await sleep(500);} throw new Error('no page'); }
const t = await firstPage();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;});
let id=0; const pend=new Map();
ws.onmessage=(e)=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(method,params={})=>new Promise(res=>{const n=++id;pend.set(n,res);ws.send(JSON.stringify({id:n,method,params}));});
await send('Page.enable'); await send('Runtime.enable');
// The observer has to exist before the document does. getEntriesByType()
// after the fact returns nothing for largest-contentful-paint in Chromium,
// which is why the first run of this reported lcpMs: null for every target.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__lcp = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lcp = Math.round(e.startTime);
    }).observe({ type: 'largest-contentful-paint', buffered: true });`,
});
await send('Emulation.setDeviceMetricsOverride',{width:440,height:956,deviceScaleFactor:3,mobile:true});
await send('Page.navigate',{url});
await sleep(20000);
const r = await send('Runtime.evaluate',{returnByValue:true,expression:`(()=>{
  const lcp = window.__lcp || 0;
  const nav=performance.getEntriesByType('navigation')[0]||{};
  return { lcpMs: lcp,
           domContentLoaded: Math.round(nav.domContentLoadedEventEnd||0),
           imgs: document.images.length,
           transferKB: Math.round(performance.getEntriesByType('resource').reduce((s,x)=>s+(x.transferSize||0),0)/1024) };
})()`});
console.log(label.padEnd(22), JSON.stringify(r.result?.result?.value));
ws.close(); browser.kill();
