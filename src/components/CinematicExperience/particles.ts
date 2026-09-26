/**
 * The FREE reveal's particles: a field of gold points that gathers, as you
 * scroll, into the shape of the word, then dissolves into the real type.
 *
 * There is no animation loop here. The film timeline owns two numbers,
 * `gather` and `fade`, and calls render() when either changes, so the canvas
 * draws only while someone is scrolling through this chapter and costs nothing
 * the rest of the time.
 *
 * The word's shape is sampled from the page's own type: the target points are
 * taken from the FREE element's actual font, size, spacing and position, so
 * the dots land on the letters and the letters then form under them. Where
 * the page draws the letters is read from the text run itself (a Range), and
 * the baseline from the font's own ascent, not estimated. Half the dots trace
 * the letters' outlines, so Bodoni's hairlines and serifs are formed too, not
 * only its thick stems.
 */

interface Dot {
  sx: number; sy: number; // scattered start
  tx: number; ty: number; // target on a letter
  delay: number; // 0..0.35: when this dot sets off
  swirl: number; // sideways bow on the way in, px
  size: number;
  shade: 0 | 1 | 2;
}

const SHADES = ["rgba(242,211,142,", "rgba(214,168,78,", "rgba(255,244,214,"] as const;

/** Small, fast, deterministic PRNG, so the field looks the same on every visit. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class GatherField {
  private ctx: CanvasRenderingContext2D | null;
  private dots: Dot[] = [];
  private w = 0;
  private h = 0;
  private dpr = 1;
  private last = { gather: -1, fade: -1 };

  constructor(private canvas: HTMLCanvasElement, private word: HTMLElement, private budget: number) {
    this.ctx = canvas.getContext("2d");
  }

  /**
   * Size the canvas to the stage and sample the word. Call on build and on
   * every refresh. The word is measured with its transforms cleared, because
   * the timeline may have it scaled at that moment; the dots aim for its
   * resting geometry.
   */
  async layout() {
    const ctx = this.ctx;
    if (!ctx) return;
    const stage = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = stage.width;
    this.h = stage.height;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);

    const cs = getComputedStyle(this.word);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    try {
      await document.fonts.load(font, this.word.textContent ?? "");
    } catch {
      /* sample with whatever face is available */
    }

    // Where the page draws the letters: the text run's own box, with the
    // lockup's transform cleared (the timeline may have it moved or scaled at
    // this moment; the dots aim for its resting geometry). A text run's box is
    // the font's ascent over its descent, whatever the line-height.
    const lockup = this.word.closest<HTMLElement>("[data-cx='free-lockup']");
    const prev = lockup?.style.transform ?? "";
    if (lockup) lockup.style.transform = "none";
    const range = document.createRange();
    range.selectNodeContents(this.word);
    const run = range.getBoundingClientRect();
    if (lockup) lockup.style.transform = prev;
    if (!run.width) return;

    // Draw the word off-screen exactly as the page sets it (same face, size,
    // spacing, case; origin at the run's left, on its baseline) and read back
    // which pixels are ink.
    const raw = this.word.textContent ?? "";
    const text = cs.textTransform === "uppercase" ? raw.toUpperCase() : raw;
    const size = parseFloat(cs.fontSize);
    const pad = Math.ceil(size * 0.3);
    const ow = Math.ceil(run.width + pad * 2);
    const oh = Math.ceil(run.height + pad * 2);
    const off = document.createElement("canvas");
    off.width = ow;
    off.height = oh;
    const o = off.getContext("2d", { willReadFrequently: true });
    if (!o) return;
    o.font = font;
    const spacing = parseFloat(cs.letterSpacing);
    if ("letterSpacing" in o && Number.isFinite(spacing)) (o as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`;
    o.textAlign = "left";
    o.textBaseline = "alphabetic";
    const ascent = o.measureText(text).fontBoundingBoxAscent;
    o.fillStyle = "#fff";
    o.fillText(text, pad, pad + ascent);
    const px = o.getImageData(0, 0, ow, oh).data;
    const ox = run.left - stage.left - pad;
    const oy = run.top - stage.top - pad;

    // Every ink pixel, split into the letters' outlines (ink with no ink a
    // few pixels away on some side) and their fill. Every row and column, and
    // faint (anti-aliased) ink too: the display cut's hairline serifs are a
    // pixel thin at this size, and sampling every other row, or only solid
    // ink, skipped them, so the dots' F had no serifs.
    const step = 1;
    const e = Math.max(2, Math.round(size / 150));
    const inkAt = (x: number, y: number) => x >= 0 && y >= 0 && x < ow && y < oh && px[(y * ow + x) * 4 + 3] > 48;
    const edge: Array<[number, number]> = [];
    const fill: Array<[number, number]> = [];
    // A hairline is all edge but only a pixel wide, so per length it would
    // get a third of the dots a thick stroke's outline gets: count it thrice.
    const hairline = (x: number, y: number) => (!inkAt(x, y - 2) && !inkAt(x, y + 2)) || (!inkAt(x - 2, y) && !inkAt(x + 2, y));
    for (let y = 0; y < oh; y += step) {
      for (let x = 0; x < ow; x += step) {
        if (!inkAt(x, y)) continue;
        const pt: [number, number] = [x + ox, y + oy];
        if (inkAt(x - e, y) && inkAt(x + e, y) && inkAt(x, y - e) && inkAt(x, y + e)) fill.push(pt);
        else if (hairline(x, y)) edge.push(pt, pt, pt);
        else edge.push(pt);
      }
    }
    if (!edge.length) return;

    const rnd = mulberry32(2026);
    const n = Math.min(this.budget, (edge.length + fill.length) * 2);
    this.dots = Array.from({ length: n }, (_, i) => {
      // Half on the outlines, half in the fill; nudged within their sample
      // cell so the letters read as scattered light, not a grid.
      const pool = i % 2 === 0 || !fill.length ? edge : fill;
      const [px0, py0] = pool[Math.floor(rnd() * pool.length)];
      const tx = px0 + (rnd() - 0.5) * step;
      const ty = py0 + (rnd() - 0.5) * step;
      // Start anywhere in the frame, weighted outwards, so they come in from the dark.
      const a = rnd() * Math.PI * 2;
      const r = (0.45 + rnd() * 0.75) * Math.hypot(this.w, this.h) * 0.5;
      return {
        sx: this.w / 2 + Math.cos(a) * r,
        sy: this.h / 2 + Math.sin(a) * r * 0.7,
        tx,
        ty,
        delay: rnd() * 0.35,
        swirl: (rnd() - 0.5) * 220,
        size: 1.1 + rnd() * (i % 9 === 0 ? 2.8 : 1.6),
        shade: (i % 3) as 0 | 1 | 2,
      };
    });
    this.last = { gather: -1, fade: -1 };
  }

  /** gather 0..1: scattered -> on the letters. fade 0..1: dots dissolve into the type. */
  render(gather: number, fade: number) {
    const ctx = this.ctx;
    if (!ctx || !this.dots.length) return;
    if (Math.abs(gather - this.last.gather) < 0.0005 && Math.abs(fade - this.last.fade) < 0.0005) return;
    this.last = { gather, fade };
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (fade >= 1 || gather <= 0) return;
    ctx.globalCompositeOperation = "lighter";
    const alphaAll = 1 - fade;
    // One fill style per shade and alpha step: a few state changes, not one per dot.
    for (let s = 0; s < 3; s++) {
      for (let band = 0; band < 4; band++) {
        const alpha = (0.5 + band * 0.17) * alphaAll;
        ctx.fillStyle = `${SHADES[s]}${alpha.toFixed(3)})`;
        for (let i = 0; i < this.dots.length; i++) {
          const d = this.dots[i];
          if (d.shade !== s) continue;
          const local = Math.min(1, Math.max(0, (gather - d.delay) / (1 - 0.35)));
          const e = 1 - Math.pow(1 - local, 3); // ease out: fast in, settling
          if (Math.min(3, Math.floor(e * 4)) !== band) continue;
          const bow = Math.sin(e * Math.PI) * d.swirl;
          const dx = d.tx - d.sx;
          const dy = d.ty - d.sy;
          const len = Math.hypot(dx, dy) || 1;
          const x = d.sx + dx * e + (-dy / len) * bow;
          const y = d.sy + dy * e + (dx / len) * bow;
          const r = d.size * (1 - fade * 0.6);
          ctx.fillRect(x - r / 2, y - r / 2, r, r);
        }
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  clear() {
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.last = { gather: -1, fade: -1 };
  }
}
