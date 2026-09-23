import fs from 'node:fs';

// Adds the missing width argument to every getCdnUrl() call site.
//
//   node tools/eprolo/36-apply-cdn-widths.mjs
//
// getCdnUrl(url) with no width skips the Serverless Image Handler entirely and
// hands back the raw S3 original — a full-resolution supplier photo, up to
// 3.3 MB, behind a 44px avatar. Only the call sites that already passed a width
// were ever resized. Each width below is roughly twice the CSS size the image
// actually renders at, so it stays sharp on a 2x display.
//
// Two call sites feed a zoomable viewer rather than a fixed box and get a
// generous width instead: shrinking those to their thumbnail size would make
// the zoom blurry, and even 1600px of WebP is far smaller than the original.

const edits = [
  // --- customer-facing --------------------------------------------------
  ['src/app/account/favourites/page.tsx',
    'src={getCdnUrl(row.imageUrl) ?? row.imageUrl}',
    'src={getCdnUrl(row.imageUrl, 440) ?? row.imageUrl}'],                 // 220px / 50vw

  ['src/app/account/history/page.tsx',
    'src={getCdnUrl(row.imageUrl) ?? row.imageUrl}',
    'src={getCdnUrl(row.imageUrl, 440) ?? row.imageUrl}'],                 // 220px / 50vw

  ['src/app/account/inquiries/page.tsx',
    'src={getCdnUrl(row.productImage) ?? row.productImage}',
    'src={getCdnUrl(row.productImage, 160) ?? row.productImage}'],         // 80px

  ['src/app/rankings/page.tsx',
    'src={getCdnUrl(product.imageUrl) as string}',
    'src={getCdnUrl(product.imageUrl, 300) as string}'],                   // 150px / 30vw

  ['src/components/ui/ProductDetailView.tsx',
    'const mainSrc = gallery[active] ? (getCdnUrl(gallery[active]) as string) : null;',
    'const mainSrc = gallery[active] ? (getCdnUrl(gallery[active], 1024) as string) : null;'], // 520px, or 100vw on mobile

  ['src/components/ui/ProductDetailView.tsx',
    '<Image src={getCdnUrl(img) as string} alt="" fill sizes="64px" className="object-contain p-1" />',
    '<Image src={getCdnUrl(img, 128) as string} alt="" fill sizes="64px" className="object-contain p-1" />'],

  ['src/components/ui/InquiryModal.tsx',
    'src={getCdnUrl(images[0]) as string} ',
    'src={getCdnUrl(images[0], 640) as string} '],                         // 320px / 100vw

  ['src/components/ui/InquiryModal.tsx',
    '<Image src={getCdnUrl(img) as string} alt="" fill className="object-cover" />',
    '<Image src={getCdnUrl(img, 96) as string} alt="" fill className="object-cover" />'], // w-12 strip

  // Pinch-to-zoom lightbox — sized for zooming, not for the viewport.
  ['src/components/ui/InquiryModal.tsx',
    '<Image src={getCdnUrl(images[activeImageIndex]) as string} alt={product.name} fill className="object-contain" sizes="100vw" priority />',
    '<Image src={getCdnUrl(images[activeImageIndex], 1600) as string} alt={product.name} fill className="object-contain" sizes="100vw" priority />'],

  ['src/components/ui/scroll-choreography.tsx',
    '<img src={getCdnUrl(img) as string} alt="" className="h-full w-full object-contain" />',
    '<img src={getCdnUrl(img, 300) as string} alt="" className="h-full w-full object-contain" />'], // max-w-[150px]

  // --- admin ------------------------------------------------------------
  ['src/app/admin/(console)/users/[id]/page.tsx',
    'src={getCdnUrl(i.productImage) ?? i.productImage}',
    'src={getCdnUrl(i.productImage, 96) ?? i.productImage}'],              // h-11 w-11

  // The thumbnail is 112-128px, but the same string is handed to onZoom, so
  // the enlarged view would inherit a thumbnail-sized file. Split the two.
  ['src/components/admin/AdminConsole.tsx',
    '  const img = inquiry.productImage ? (getCdnUrl(inquiry.productImage) as string) : null;',
    '  const img = inquiry.productImage ? (getCdnUrl(inquiry.productImage, 256) as string) : null;\n  const zoomImg = inquiry.productImage ? (getCdnUrl(inquiry.productImage, 1600) as string) : null;'],

  ['src/components/admin/AdminConsole.tsx',
    'onClick={() => onZoom(img)}',
    'onClick={() => onZoom(zoomImg ?? img)}'],

  ['src/components/admin/AdminConsole.tsx',
    'const src = i.productImage ? getCdnUrl(i.productImage) : null;',
    'const src = i.productImage ? getCdnUrl(i.productImage, 96) : null;'], // h-9 w-9 print sheet

  ['src/components/admin/AdminConsole.tsx',
    '<Image src={getCdnUrl(src) as string} alt={alt} fill sizes="56px" className="object-cover" />',
    '<Image src={getCdnUrl(src, 128) as string} alt={alt} fill sizes="56px" className="object-cover" />'],

  ['src/components/admin/MobileInquiriesConsole.tsx',
    'const img = getCdnUrl(r.productImage);',
    'const img = getCdnUrl(r.productImage, 96);'],                         // 40px row thumb

  ['src/components/admin/MobileInquiriesConsole.tsx',
    'const img = getCdnUrl(data?.productImage);',
    'const img = getCdnUrl(data?.productImage, 192);'],                    // 88px detail
];

let applied = 0;
const byFile = new Map();
for (const [file, from, to] of edits) {
  if (!byFile.has(file)) byFile.set(file, fs.readFileSync(file, 'utf8'));
  let s = byFile.get(file);
  const n = s.split(from).length - 1;
  if (n === 0) { console.error(`MISS  ${file}\n      ${from.slice(0, 90)}`); process.exitCode = 1; continue; }
  if (n > 1) { console.error(`AMBIGUOUS (${n}x)  ${file}\n      ${from.slice(0, 90)}`); process.exitCode = 1; continue; }
  byFile.set(file, s.replace(from, to));
  applied++;
}
if (process.exitCode) { console.error('\nno files written'); process.exit(1); }
for (const [file, s] of byFile) fs.writeFileSync(file, s);
console.log(`applied ${applied} edits across ${byFile.size} files`);
