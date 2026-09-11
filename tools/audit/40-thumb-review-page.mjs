// Builds a self-contained review page for every tile on the "Browse by
// Category" grid, so the thumbnails can be judged by eye and the bad ones
// flagged.
//
//   node tools/audit/40-thumb-review-page.mjs
//
// Images are inlined as data: URIs rather than linked. The page is meant to be
// openable anywhere — including as a published artifact, whose CSP blocks
// images from our CloudFront domain outright — and a review page with broken
// images is no review page at all.
//
// This exists because no rule here can judge a photograph. The assignment
// script guarantees each category a DISTINCT image; it cannot tell a clear
// product shot from a dark close-crop of somebody's torso. That judgement is
// made by eye, on 53 tiles, and locked in with thumbnailLocked.
import fs from 'fs';
import sharp from 'sharp';
import { q, close } from './lib.mjs';
import { isCategoryBlocked } from './rules.mjs';

const MIN_ROOT_TILE_PRODUCTS = 25; // keep in step with lib/categoryTree.ts

const cats = await q(`SELECT id,name,"parentId","thumbnailUrl","thumbnailLocked","displayAsTopLevel","displayLabel" FROM "Category"`);
const counts = Object.fromEntries(
  (await q(`SELECT "categoryId" id, count(*)::int c FROM "Product" WHERE "categoryId" IS NOT NULL GROUP BY 1`)).map((r) => [r.id, r.c])
);
const byId = new Map(cats.map((c) => [c.id, c]));
const kids = new Map();
for (const c of cats) {
  if (!c.parentId || !byId.has(c.parentId)) continue;
  if (!kids.has(c.parentId)) kids.set(c.parentId, []);
  kids.get(c.parentId).push(c.id);
}
const deep = (id, s = new Set()) => {
  if (s.has(id)) return 0;
  s.add(id);
  return (counts[id] || 0) + (kids.get(id) ?? []).reduce((a, k) => a + deep(k, s), 0);
};
const blocked = (id, s = new Set()) => {
  if (s.has(id)) return false;
  s.add(id);
  const c = byId.get(id);
  if (!c) return false;
  return isCategoryBlocked(c.name) || (c.parentId ? blocked(c.parentId, s) : false);
};

const mains = cats
  .filter((c) => (!c.parentId || !byId.has(c.parentId)) && !blocked(c.id) && deep(c.id) >= MIN_ROOT_TILE_PRODUCTS)
  .map((c) => ({ ...c, label: c.name, parent: null, n: deep(c.id) }))
  .sort((a, b) => b.n - a.n);

const promoted = cats
  .filter((c) => c.displayAsTopLevel && c.parentId && byId.has(c.parentId) && !blocked(c.id))
  .map((c) => ({ ...c, label: c.displayLabel || c.name, parent: byId.get(c.parentId).name, n: deep(c.id) }))
  .sort((a, b) => b.n - a.n);

const all = [...mains, ...promoted];
console.log(`tiles: ${all.length} (${mains.length} main + ${promoted.length} promoted)`);

let ok = 0, failed = 0;
await Promise.all(all.map(async (t) => {
  if (!t.thumbnailUrl) { t.data = null; failed++; return; }
  try {
    const r = await fetch(t.thumbnailUrl, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(String(r.status));
    const buf = await sharp(Buffer.from(await r.arrayBuffer()))
      .resize(260, 260, { fit: 'cover' }).jpeg({ quality: 74 }).toBuffer();
    t.data = 'data:image/jpeg;base64,' + buf.toString('base64');
    ok++;
  } catch { t.data = null; failed++; }
}));
console.log(`  inlined ${ok}, failed ${failed}`);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const card = (t) => [
  '<button class="tile" type="button" data-id="' + esc(t.id) + '" data-name="' + esc(t.label) + '">',
  '<span class="ring">' + (t.data ? '<img src="' + t.data + '" alt="">' : '<span class="noimg">no image</span>') + '</span>',
  '<span class="nm">' + esc(t.label) + '</span>',
  t.parent ? '<span class="sub">in ' + esc(t.parent) + '</span>' : '<span class="sub main">main category</span>',
  '<span class="ct">' + t.n.toLocaleString('en-US') + '</span>',
  t.thumbnailLocked ? '<span class="lk">locked</span>' : '',
  '<span class="flag">FLAGGED</span>',
  '</button>',
].join('');

const html = `<title>Category Thumbnail Review</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<style>
/* Affhan's own palette — #27a8c4 / #176579 / #081f2a from the site's buttons
   and headings — with neutrals pulled slightly toward the teal so the greys
   read as chosen rather than inherited. */
:root{--bg:#f4f7f8;--fg:#081f2a;--mut:#5b7280;--line:#dbe4e8;--card:#fff;--bad:#c0362c;--accent:#176579;--accent-lift:#27a8c4}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#071319;--fg:#e3edf1;--mut:#8298a4;--line:#172c36;--card:#0e1d25;--bad:#e5675c;--accent:#27a8c4;--accent-lift:#5cc9e0}}
:root[data-theme="dark"]{--bg:#071319;--fg:#e3edf1;--mut:#8298a4;--line:#172c36;--card:#0e1d25;--bad:#e5675c;--accent:#27a8c4;--accent-lift:#5cc9e0}
body{background:var(--bg);color:var(--fg);font:15px/1.55 "IBM Plex Sans","Segoe UI",system-ui,sans-serif;margin:0;padding:28px 24px 48px}
.wrap{max-width:1180px;margin:0 auto}
h1{font-family:"Archivo","Segoe UI",system-ui,sans-serif;font-weight:800;font-size:23px;letter-spacing:-.015em;margin:0 0 5px;text-wrap:balance}
p.lede{color:var(--mut);margin:0 0 16px;max-width:68ch}
.bar{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 0 14px;margin-bottom:6px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.count{font-weight:700}
button.act{font:inherit;font-weight:600;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:9px;padding:7px 13px;cursor:pointer;transition:border-color .15s}
button.act:hover{border-color:var(--accent)}
button.act:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
h2{font-family:"Archivo","Segoe UI",system-ui,sans-serif;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--mut);margin:30px 0 13px;display:flex;align-items:baseline;gap:9px}
h2::after{content:"";flex:1;height:1px;background:var(--line)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:18px 12px}
.tile{all:unset;box-sizing:border-box;cursor:pointer;display:flex;flex-direction:column;align-items:center;text-align:center;gap:5px;padding:10px 4px;border-radius:12px;position:relative}
.tile:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ring{width:96px;height:96px;border-radius:50%;overflow:hidden;border:2px solid var(--line);background:var(--card);display:flex;align-items:center;justify-content:center}
.ring img{width:100%;height:100%;object-fit:cover;display:block}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
.noimg{font-size:10px;color:var(--mut)}
.nm{font-size:12.5px;font-weight:600;line-height:1.25}
.sub{font-size:10px;color:var(--mut)}
.sub.main{color:var(--accent);font-weight:600;text-transform:uppercase;letter-spacing:.06em;font-size:9px}
.ct{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:10px;color:var(--mut);font-variant-numeric:tabular-nums}
.lk{font-size:9px;background:var(--accent);color:#fff;border-radius:4px;padding:1px 5px;letter-spacing:.04em}
.flag{display:none;position:absolute;top:2px;right:2px;background:var(--bad);color:#fff;font-size:9px;font-weight:800;letter-spacing:.05em;border-radius:5px;padding:2px 6px}
.tile.bad .ring{border-color:var(--bad);border-width:3px}
.tile.bad .flag{display:block}
#out{margin-top:26px;border-top:1px solid var(--line);padding-top:16px}
textarea{width:100%;min-height:130px;font:12px/1.6 "IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:11px;box-sizing:border-box}
</style>
<div class="wrap">
<h1>Category thumbnail review</h1>
<p class="lede">Every tile on the <strong>Browse by Category</strong> grid. Click any circle whose image is unclear, too tightly cropped, too dark, or just not representative of its category. Then press <em>Copy list</em> and send it back.</p>
<div class="bar">
  <span class="count"><span id="n">0</span> flagged</span>
  <button class="act" id="copy" type="button">Copy list</button>
  <button class="act" id="clear" type="button">Clear all</button>
</div>
<h2>Main categories (${mains.length})</h2>
<div class="grid">${mains.map(card).join('')}</div>
<h2>Promoted subcategories (${promoted.length})</h2>
<div class="grid">${promoted.map(card).join('')}</div>
<div id="out">
  <h2>Flagged — copy this back</h2>
  <textarea id="ta" readonly placeholder="Click tiles above to flag them."></textarea>
</div>
</div>
<script>
var bad = new Map();
function sync(){
  document.getElementById('n').textContent = bad.size;
  var lines = [];
  bad.forEach(function(nm, id){ lines.push(nm + '  [' + id + ']'); });
  document.getElementById('ta').value = lines.join('\\n');
}
document.querySelectorAll('.tile').forEach(function(el){
  el.addEventListener('click', function(){
    var id = el.getAttribute('data-id');
    if (bad.has(id)) { bad.delete(id); el.classList.remove('bad'); }
    else { bad.set(id, el.getAttribute('data-name')); el.classList.add('bad'); }
    sync();
  });
});
document.getElementById('clear').addEventListener('click', function(){
  bad.clear();
  document.querySelectorAll('.tile.bad').forEach(function(e){ e.classList.remove('bad'); });
  sync();
});
document.getElementById('copy').addEventListener('click', function(){
  var ta = document.getElementById('ta');
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  if (navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(function(){});
});
sync();
</script>`;

fs.mkdirSync('tools/audit/out', { recursive: true });
fs.writeFileSync('tools/audit/out/thumb-review.html', html);
console.log(`wrote tools/audit/out/thumb-review.html (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
await close();
