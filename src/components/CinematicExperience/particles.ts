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
 * taken from the FREE element's actual font, size and position, so the dots
 * land where the letters then appear.
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

    // Resting box of the word, relative to the canvas.
    const lockup = this.word.closest<HTMLElement>("[data-cx='free-lockup']");
    const prev = lockup?.style.transform ?? "";
    if (lockup) lockup.style.transform = "none";
    const box = this.word.getBoundingClientRect();
    if (lockup) lockup.style.transform = prev;
    const cx = box.left - stage.left + box.width / 2;
    const cy = box.top - stage.top + box.height / 2;

    // Draw the word off-screen and read back which pixels are ink.
    const text = (this.word.textContent ?? "").toUpperCase();
    const size = parseFloat(cs.fontSize);
    const off = document.createElement("canvas");
    const ow = Math.ceil(box.width + size * 0.4);
    const oh = Math.ceil(box.height + size * 0.4);
    off.width = ow;
    off.height = oh;
    const o = off.getContext("2d", { willReadFrequently: true });
    if (!o) return;
    o.font = font;
    o.textAlign = "center";
    o.textBaseline = "middle";
    const spacing = parseFloat(cs.letterSpacing);
    if ("letterSpacing" in o && Number.isFinite(spacing)) (o as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`;
    o.fillStyle = "#fff";
    o.fillText(text, ow / 2, oh / 2 + size * 0.04);
    const px = o.getImageData(0, 0, ow, oh).data;

    const ink: Array<[number, number]> = [];
    const step = Math.max(2, Math.round(size / 70));
    for (let y = 0; y < oh; y += step) {
      for (let x = 0; x < ow; x += step) {
        if (px[(y * ow + x) * 4 + 3] > 140) ink.push([x - ow / 2 + cx, y - oh / 2 + cy]);
      }
    }
    if (!ink.length) return;

    const rnd = mulberry32(2026);
    const n = Math.min(this.budget, ink.length * 2);
    this.dots = Array.from({ length: n }, (_, i) => {
      const [tx, ty] = ink[Math.floor(rnd() * ink.length)];
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
        size: 0.8 + rnd() * (i % 9 === 0 ? 2.4 : 1.3),
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
        const alpha = (0.35 + band * 0.2) * alphaAll;
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
