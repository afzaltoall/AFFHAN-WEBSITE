"use client";

import { useEffect, useRef, type CSSProperties } from "react";

/**
 * The night sky behind the whole page.
 *
 * One fixed layer under every section, so the sky stays put while the story
 * scrolls past it (the stages and sections above it are transparent where the
 * sky should show; Terms keeps a near-opaque ground, for reading). Built to
 * cost nothing while nobody is looking at it:
 *
 *  - The small stars are drawn ONCE into three canvases (far, and two middle
 *    layers) and redrawn only when the width changes. No animation loop.
 *  - They twinkle because the two middle layers fade in and out of phase with
 *    each other: CSS opacity, which the compositor runs off the main thread.
 *  - A handful of bright stars with a soft cross, and two shooting stars on
 *    long, uneven cycles: also CSS, transform and opacity only.
 *  - Depth: animations.ts drifts the layers at different speeds as the page
 *    scrolls (buildStars), dims the sky under the FREE reveal, and slides the
 *    whole sky up with the end of the page so it never covers the footer.
 *
 * Reduced motion: the stars are drawn and simply stay still (cinematic.css).
 * Every position comes from a seeded generator, so the sky is the same on
 * every visit, and the server and browser render the same bright stars.
 */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The canvases are this much taller than the screen, so the drift never shows an edge. */
const OVERSCAN = 1.16;

/** Star layers: one star per `per` square pixels; radius and alpha ranges. */
const LAYERS = [
  { seed: 101, per: 3400, rMin: 0.3, rMax: 0.9, aMin: 0.22, aMax: 0.62, glowAt: 9 },
  { seed: 202, per: 12000, rMin: 0.5, rMax: 1.3, aMin: 0.4, aMax: 0.95, glowAt: 0.95 },
  { seed: 303, per: 12000, rMin: 0.5, rMax: 1.3, aMin: 0.4, aMax: 0.95, glowAt: 0.95 },
] as const;

/** Warm white most of the time, pale gold sometimes, a few cool blue-whites. */
function tint(r: number) {
  if (r < 0.12) return "223,232,255";
  if (r < 0.32) return "242,211,142";
  return "255,246,232";
}

function paint(canvas: HTMLCanvasElement, w: number, h: number, dpr: number, layer: (typeof LAYERS)[number]) {
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const rnd = mulberry32(layer.seed);
  const n = Math.round((w * h) / layer.per);
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    // Most stars small, a few larger: a skewed distribution looks like a sky.
    const r = layer.rMin + Math.pow(rnd(), 2.4) * (layer.rMax - layer.rMin);
    const a = layer.aMin + rnd() * (layer.aMax - layer.aMin);
    const col = tint(rnd());
    if (r > layer.glowAt) {
      ctx.fillStyle = `rgba(${col},${(a * 0.13).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(${col},${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The bright stars: fixed positions (as % of the screen), size, twinkle timing. */
const BRIGHT = (() => {
  const rnd = mulberry32(2026);
  return Array.from({ length: 24 }, (_, i) => ({
    left: 3 + rnd() * 94,
    top: 4 + rnd() * 88,
    size: 7 + rnd() * 9,
    dur: 3.8 + rnd() * 4.6,
    delay: -rnd() * 8,
    cross: i % 3 === 0,
  }));
})();

/** Two shooting stars, on long cycles that never line up. */
const SHOOTING = [
  { x: "18%", y: "14%", rot: "24deg", len: "38vw", dur: "13s", delay: "4s" },
  { x: "70%", y: "10%", rot: "148deg", len: "30vw", dur: "19s", delay: "11s" },
] as const;

export function Starfield() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const canvases = Array.from(root.querySelectorAll<HTMLCanvasElement>("canvas[data-layer]"));
    let lastW = 0;
    let timer = 0;

    const draw = () => {
      const w = window.innerWidth;
      // Phones resize the viewport's height as the toolbar comes and goes;
      // only a change of width is worth redrawing the sky for.
      if (lastW && Math.abs(w - lastW) < 2) return;
      lastW = w;
      const h = Math.round(window.innerHeight * OVERSCAN);
      // Stars are single pixels: a density above 1.5 buys nothing visible
      // and costs memory in three full-screen layers.
      let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if (w * h * dpr * dpr > 3_000_000) dpr = Math.max(1, Math.sqrt(3_000_000 / (w * h)));
      canvases.forEach((c, i) => paint(c, w, h, dpr, LAYERS[i]));
      root.dataset.ready = "on";
    };
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(draw, 180);
    };

    draw();
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div ref={ref} data-cx="stars" aria-hidden className="cx-stars pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Dimmed by the film under the FREE reveal; the root itself fades in and follows the page end. */}
      <div data-cx="stars-dim" className="absolute inset-0">
      <canvas data-layer="far" data-cx="stars-far" className="cx-stars-layer" />
      <canvas data-layer="mid" data-cx="stars-mid" className="cx-stars-layer cx-twinkle-a" />
      <canvas data-layer="mid" data-cx="stars-mid2" className="cx-stars-layer cx-twinkle-b" />
      <div data-cx="stars-bright" className="cx-stars-layer">
        {BRIGHT.map((s, i) => (
          <span
            key={i}
            className="cx-star"
            data-cross={s.cross ? "" : undefined}
            style={{
              left: `${s.left.toFixed(2)}%`,
              top: `${(s.top / OVERSCAN).toFixed(2)}%`,
              "--s": `${s.size.toFixed(1)}px`,
              "--dur": `${s.dur.toFixed(2)}s`,
              "--delay": `${s.delay.toFixed(2)}s`,
            } as CSSProperties}
          />
        ))}
      </div>
      {SHOOTING.map((s, i) => (
        <span
          key={i}
          className="cx-shoot"
          style={{ "--x": s.x, "--y": s.y, "--rot": s.rot, "--len": s.len, "--dur": s.dur, "--delay": s.delay } as CSSProperties}
        />
      ))}
      </div>
    </div>
  );
}
