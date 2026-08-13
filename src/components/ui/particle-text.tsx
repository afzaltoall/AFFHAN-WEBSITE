"use client";

import { useEffect, useRef } from "react";
import { useScroll, useMotionValueEvent, useReducedMotion } from "framer-motion";

/**
 * Scroll-driven particle assembly.
 *
 * Glowing cyan particles start scattered and, tied to scroll progress, fly in
 * and settle into the shape of `text` — brightening as they lock into place.
 * Scroll back and they scatter again. Pure 2D canvas, no libraries.
 */
export function ParticleText({
  text = "AFFHAN",
  className,
  color = "39,168,196",
}: {
  text?: string;
  className?: string;
  color?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(0);
  const reduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: wrapRef,
    offset: ["start 0.85", "center 0.5"],
  });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    progressRef.current = v;
  });

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let W = 0;
    let H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let particles: { sx: number; sy: number; tx: number; ty: number; d: number }[] = [];

    const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

    function build() {
      const rect = wrap!.getBoundingClientRect();
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      canvas!.width = Math.round(W * dpr);
      canvas!.height = Math.round(H * dpr);
      canvas!.style.width = `${W}px`;
      canvas!.style.height = `${H}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Render the target text offscreen, then sample its pixels.
      const off = document.createElement("canvas");
      off.width = W;
      off.height = H;
      const octx = off.getContext("2d");
      if (!octx) return;
      const fontSize = Math.min((W / Math.max(1, text.length)) * 1.5, H * 0.72);
      octx.fillStyle = "#fff";
      octx.font = `900 ${fontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
      octx.textAlign = "center";
      octx.textBaseline = "middle";
      octx.fillText(text, W / 2, H / 2);
      const data = octx.getImageData(0, 0, W, H).data;

      const gap = Math.max(3, Math.round(fontSize / 34)); // sampling density
      const pts: { sx: number; sy: number; tx: number; ty: number; d: number }[] = [];
      for (let y = 0; y < H; y += gap) {
        for (let x = 0; x < W; x += gap) {
          if (data[(y * W + x) * 4 + 3] > 128) {
            pts.push({
              tx: x,
              ty: y,
              sx: Math.random() * W,
              sy: Math.random() * H,
              d: Math.random(), // per-particle timing offset
            });
          }
        }
      }
      particles = pts;
    }

    function draw() {
      const p = clamp(progressRef.current);
      ctx!.clearRect(0, 0, W, H);
      ctx!.globalCompositeOperation = "lighter";
      const rgb = color;
      for (const pt of particles) {
        // stagger each particle slightly so they don't all arrive together
        const local = easeInOut(clamp((p - pt.d * 0.25) / 0.75));
        const x = pt.sx + (pt.tx - pt.sx) * local;
        const y = pt.sy + (pt.ty - pt.sy) * local;
        const alpha = 0.15 + 0.7 * local;
        const size = 1.6 - 0.4 * local;
        ctx!.fillStyle = `rgba(${rgb},${alpha})`;
        ctx!.beginPath();
        ctx!.arc(x, y, size, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(draw);
    }

    build();
    if (reduce) {
      // Static assembled state for reduced motion.
      progressRef.current = 1;
    }
    draw();

    const onResize = () => build();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [text, color, reduce]);

  return (
    <div ref={wrapRef} className={`relative w-full ${className ?? "h-[45vh]"}`}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}

export default ParticleText;
