"use client";

import { useEffect, useRef } from "react";

/**
 * Tiny gold particles drifting upwards: the ambient light of the final call to
 * action and the success state.
 *
 * Unlike the FREE particles this one is time-based, so it is kept on a short
 * leash: it runs only while its canvas is on screen and the tab is visible,
 * draws at 30fps, and never runs at all for anyone who asked for reduced
 * motion (they get one still frame). A few dozen dots, no per-frame
 * allocation beyond their fill strings.
 */
export function GoldDust({ className = "", density = 1 }: { className?: string; density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0, h = 0, raf = 0, last = 0, running = false, onScreen = false;
    let seed = 11;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    type P = { x: number; y: number; r: number; vx: number; vy: number; tw: number; ts: number; a: number };
    let parts: P[] = [];

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const p of parts) {
        const a = p.a * (0.55 + 0.45 * Math.sin(p.tw + t * 0.001 * p.ts));
        if (p.r > 1.6) {
          ctx.fillStyle = `rgba(214,168,78,${(a * 0.18).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = `rgba(242,211,142,${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(90, (w * h) / 15000) * density);
      seed = 11;
      parts = Array.from({ length: n }, () => ({
        x: rnd() * w,
        y: rnd() * h,
        r: 0.5 + rnd() * 1.7,
        vx: (rnd() - 0.5) * 5,
        vy: -(3 + rnd() * 9),
        tw: rnd() * Math.PI * 2,
        ts: 0.5 + rnd() * 1.3,
        a: 0.25 + rnd() * 0.55,
      }));
      draw(performance.now());
    };

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 33) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      for (const p of parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y < -12) { p.y = h + 12; p.x = rnd() * w; }
        if (p.x < -12) p.x = w + 12;
        else if (p.x > w + 12) p.x = -12;
      }
      draw(t);
    };
    const start = () => {
      if (running || reduced || !onScreen || document.hidden) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    const ro = new ResizeObserver(resize);
    const onVis = () => (document.hidden ? stop() : start());
    io.observe(canvas);
    ro.observe(canvas);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [density]);

  return <canvas ref={ref} aria-hidden className={className} />;
}
