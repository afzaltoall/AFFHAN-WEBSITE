// Cheap skin-exposure score for a product photo.
//
// ---------------------------------------------------------------------------
// THIS DID NOT WORK. Kept, with its result, so nobody builds it a second time.
// ---------------------------------------------------------------------------
//
// The idea was to rank images so a human review pass sees the most-exposed few
// hundred first instead of reading 8,000 contact sheets. Measured against
// findings confirmed by eye, it ranks no better than chance on the two problems
// this catalogue actually has:
//
//   1. Cropped close-ups of a CLOTHED body part — the buttock-and-crotch yoga
//      photography that prompted the report. 620605 is one of the clearest
//      examples in the catalogue and scores centre=0.000, ranking 923rd of 974
//      products in its own category. There is no exposed skin in the frame at
//      all: opaque leggings fill it. The offence is the framing, and a
//      skin-tone histogram cannot see framing.
//   2. Sheer dark fabric over skin. 1208786, a mesh bodysuit with the body
//      plainly visible, scores 0.232 — below a plain beige knit jumper at
//      0.590, because tan garments read as skin and black mesh reads as cloth.
//
// So "review everything above a threshold" would have had to include 95% of a
// category to catch the items already found in it, which is not a filter. The
// remaining honest option is to look at the pictures, which is what
// tools/audit/06-build-priority.mjs is for.
//
// A working version of this needs a model that understands pose, framing and
// garment opacity — not pixel colour. Do not re-derive the colour version.
import sharp from 'sharp';

/// RGB skin-tone test, union of the two rules that survive JPEG compression.
function isSkin(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  // Classic uniform-daylight rule.
  const a = r > 95 && g > 40 && b > 20 && mx - mn > 15 && Math.abs(r - g) > 15 && r > g && r > b;
  // Flash / white-balance-shifted rule, for studio product shots.
  const c = r > 220 && g > 210 && b > 170 && Math.abs(r - g) <= 15 && r > b && g > b;
  return a || c;
}

/// Returns { skin, centre } — the fraction of pixels that read as skin over the
/// whole frame, and over the central half where the model actually is.
export async function skinScore(buf) {
  const N = 96;
  const { data } = await sharp(buf).removeAlpha().resize(N, N, { fit: 'cover' })
    .raw().toBuffer({ resolveWithObject: true });
  let skin = 0, centre = 0, centreTotal = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 3;
      const s = isSkin(data[i], data[i + 1], data[i + 2]);
      if (s) skin++;
      const inCentre = x >= N * 0.25 && x < N * 0.75 && y >= N * 0.15 && y < N * 0.85;
      if (inCentre) { centreTotal++; if (s) centre++; }
    }
  }
  return { skin: skin / (N * N), centre: centre / centreTotal };
}
