// Builds numbered contact sheets of product images so they can be reviewed by
// eye. The reports that started this were about PHOTOGRAPHS, not product names
// — no keyword rule can see those, so the images have to be looked at.
//
// Grid size is configurable because it is a real trade-off: more tiles per
// sheet means fewer sheets to read, but a sheer mesh top and a plain knit
// jumper stop being distinguishable below roughly 180px.
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export const GRID = { cols: 8, rows: 8, tile: 200, label: 22 };

// Tiles are labelled with the PRODUCT ID, never a position in the sheet.
//
// They were labelled by index first, and that quietly produced six wrong
// findings: moving 235 products into ModerationLog removed 8 from a category,
// the manifest was rebuilt one product shorter, and every index in an
// already-reviewed sheet then pointed at its neighbour. An id printed on the
// picture cannot drift away from the picture.

async function fetchImage(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}

function labelSvg(text, w, h) {
  const t = String(text).replace(/[<>&]/g, '');
  return Buffer.from(
    `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#111"/>` +
    `<text x="5" y="${h - 6}" font-family="monospace" font-size="${h - 7}" fill="#fff">${t}</text></svg>`
  );
}

/// items: [{ idx, imageUrl }] -> writes one JPEG sheet
export async function buildSheet(items, outPath, grid = GRID) {
  const { cols, rows, tile, label } = grid;
  const tiles = await Promise.all(items.map(async (it) => {
    const raw = it.imageUrl ? await fetchImage(it.imageUrl) : null;
    let img = null;
    if (raw) {
      try { img = await sharp(raw).resize(tile, tile, { fit: 'cover' }).removeAlpha().toBuffer(); }
      catch { img = null; }
    }
    if (!img) img = await sharp({ create: { width: tile, height: tile, channels: 3, background: '#333' } }).png().toBuffer();
    return sharp({ create: { width: tile, height: tile + label, channels: 3, background: '#000' } })
      .composite([{ input: img, top: label, left: 0 }, { input: labelSvg(it.id, tile, label), top: 0, left: 0 }])
      .png().toBuffer();
  }));

  const composite = tiles.map((input, i) => ({
    input,
    top: Math.floor(i / cols) * (tile + label),
    left: (i % cols) * tile,
  }));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp({ create: { width: cols * tile, height: rows * (tile + label), channels: 3, background: '#000' } })
    .composite(composite).jpeg({ quality: 80 }).toFile(outPath);
  return outPath;
}

export const PER_SHEET = GRID.cols * GRID.rows;
