"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * A card that sets off fireworks inside itself while the pointer is on it.
 *
 * Hovering lifts the card, zooms and dims whatever it holds, and fades a navy
 * "night sky" in from the top, so the sparks have something dark to glow
 * against. The first rocket goes up the moment the pointer arrives, so the
 * card answers straight away; more follow every 0.55-0.85s, now and then two
 * at once. Leaving stops the launches and lets what is already in the air
 * finish falling.
 *
 * Drawn on a canvas, clipped to the card's rounded corners. The loop runs only
 * while there is something to draw, so an idle card costs nothing.
 *
 * Nothing is launched for a touch (a tap is not a hover, and the card sits
 * where it does only on wide windows anyway) or when the visitor has asked
 * for reduced motion; for them the card only deepens its shadow and dims,
 * without the lift or the zoom.
 */

interface Spark {
  x: number; y: number; px: number; py: number;
  vx: number; vy: number;
  life: number; max: number;
  color: string; width: number;
  drag: number; gravity: number;
  twinkle: boolean;
}
interface Rocket {
  x: number; y: number; px: number; py: number;
  vx: number; vy: number;
  apex: number; palette: readonly string[];
}
interface Flash { x: number; y: number; life: number; color: string }

// Gold, China red, orange, and the site's own cyan. Each burst takes one
// palette; the last colour of each is its bright core.
const PALETTES = [
  ["#FFD166", "#FFE8A3", "#FFF7DA"],
  ["#FF4D4F", "#FF8A7A", "#FFD166"],
  ["#FF9F1C", "#FFC46B", "#FFF1C7"],
  ["#27A8C4", "#7FDDF0", "#E6FAFF"],
] as const;

const ROCKET_GRAVITY = 380; // px/s², slowing the rocket as it climbs
const MAX_SPARKS = 420;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

export function HoverFireworks({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const state = useRef({
    hovering: false,
    rockets: [] as Rocket[],
    sparks: [] as Spark[],
    flashes: [] as Flash[],
    raf: 0,
    last: 0,
    launchTimer: 0 as ReturnType<typeof setTimeout> | 0,
    w: 0, h: 0, dpr: 1,
    lastPalette: -1,
  });

  const explode = useCallback((r: Rocket) => {
    const s = state.current;
    const kind = pick(["peony", "peony", "ring", "willow"] as const);
    // Scaled to the card, so a burst fills a good part of it without
    // swallowing it: about 45px across on a 112px-tall card.
    const scale = s.h / 112;
    const count = kind === "ring" ? 34 : kind === "willow" ? 38 : 46;
    const base = (kind === "willow" ? 58 : 76) * scale;
    for (let i = 0; i < count && s.sparks.length < MAX_SPARKS; i++) {
      const angle = (i / count) * Math.PI * 2 + rand(-0.08, 0.08);
      const speed = kind === "ring" ? base * rand(0.92, 1) : base * rand(0.45, 1);
      const max = kind === "willow" ? rand(1.3, 1.8) : rand(0.8, 1.25);
      s.sparks.push({
        x: r.x, y: r.y, px: r.x, py: r.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: max, max,
        color: kind === "willow" ? pick(PALETTES[0]) : pick(r.palette),
        width: kind === "willow" ? rand(0.9, 1.3) : rand(1.1, 1.8),
        drag: kind === "willow" ? 0.965 : 0.955,
        gravity: (kind === "willow" ? 70 : 52) * scale,
        twinkle: Math.random() < (kind === "willow" ? 0.6 : 0.3),
      });
    }
    s.flashes.push({ x: r.x, y: r.y, life: 0.2, color: r.palette[2] });
  }, []);

  const step = useCallback((now: number) => {
    const s = state.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) { s.raf = 0; return; }
    const dt = Math.min(0.033, (now - (s.last || now)) / 1000);
    s.last = now;

    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    ctx.clearRect(0, 0, s.w, s.h);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";

    // Rockets: a short bright streak, slowing as it climbs, and a few embers
    // shed behind it. They burst at their apex, or when they run out of lift.
    for (let i = s.rockets.length - 1; i >= 0; i--) {
      const r = s.rockets[i];
      r.px = r.x; r.py = r.y;
      r.vy += ROCKET_GRAVITY * dt;
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = "#FFF1C7";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(r.px, r.py + 7);
      ctx.lineTo(r.x, r.y);
      ctx.stroke();
      if (Math.random() < 0.7 && s.sparks.length < MAX_SPARKS) {
        s.sparks.push({
          x: r.x, y: r.y + 2, px: r.x, py: r.y + 2,
          vx: rand(-12, 12), vy: rand(10, 30),
          life: 0.3, max: 0.3, color: "#FFC46B", width: 0.9,
          drag: 0.94, gravity: 40, twinkle: true,
        });
      }
      if (r.y <= r.apex || r.vy >= -12) {
        explode(r);
        s.rockets.splice(i, 1);
      }
    }

    // The flash of a burst: a brief bloom, gone in a fifth of a second.
    for (let i = s.flashes.length - 1; i >= 0; i--) {
      const f = s.flashes[i];
      f.life -= dt;
      if (f.life <= 0) { s.flashes.splice(i, 1); continue; }
      const k = f.life / 0.2;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 26);
      g.addColorStop(0, f.color);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = 0.45 * k;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 26, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sparks: drawn as streaks from where they were to where they are, which
    // is what the eye sees of a real one, fading as they burn out.
    for (let i = s.sparks.length - 1; i >= 0; i--) {
      const p = s.sparks[i];
      p.life -= dt;
      if (p.life <= 0) { s.sparks.splice(i, 1); continue; }
      const drag = Math.pow(p.drag, dt * 60);
      p.px = p.x; p.py = p.y;
      p.vx *= drag;
      p.vy = p.vy * drag + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      let alpha = Math.pow(p.life / p.max, 1.4);
      if (p.twinkle) alpha *= rand(0.35, 1);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width;
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x + (p.x === p.px ? 0.01 : 0), p.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (s.hovering || s.rockets.length || s.sparks.length || s.flashes.length) {
      s.raf = requestAnimationFrame(step);
    } else {
      ctx.clearRect(0, 0, s.w, s.h);
      s.raf = 0;
      s.last = 0;
    }
  }, [explode]);

  const ensureLoop = useCallback(() => {
    const s = state.current;
    if (!s.raf) s.raf = requestAnimationFrame(step);
  }, [step]);

  const launch = useCallback(() => {
    const s = state.current;
    let i = Math.floor(Math.random() * PALETTES.length);
    // Never the same colours twice running.
    if (i === s.lastPalette) i = (i + 1) % PALETTES.length;
    s.lastPalette = i;
    const x = rand(0.14, 0.86) * s.w;
    const y = s.h + 4;
    const apex = rand(0.2, 0.46) * s.h;
    // Fast enough to reach its apex in about half a second.
    const vy = -Math.sqrt(2 * ROCKET_GRAVITY * (y - apex)) * 1.04;
    s.rockets.push({ x, y, px: x, py: y, vx: rand(-14, 14), vy, apex, palette: PALETTES[i] });
    ensureLoop();
  }, [ensureLoop]);

  const schedule = useCallback(() => {
    const s = state.current;
    s.launchTimer = setTimeout(() => {
      if (!s.hovering) return;
      launch();
      if (Math.random() < 0.28) setTimeout(() => s.hovering && launch(), 140);
      schedule();
    }, rand(550, 850));
  }, [launch]);

  const onEnter = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const s = state.current;
    const canvas = canvasRef.current;
    if (!canvas || s.hovering) return;
    // Sized on each hover, for the device pixel ratio the window has now.
    const rect = canvas.getBoundingClientRect();
    s.dpr = Math.min(2, window.devicePixelRatio || 1);
    s.w = rect.width;
    s.h = rect.height;
    canvas.width = Math.round(rect.width * s.dpr);
    canvas.height = Math.round(rect.height * s.dpr);
    s.hovering = true;
    launch();
    schedule();
  }, [launch, schedule]);

  const onLeave = useCallback(() => {
    const s = state.current;
    s.hovering = false;
    if (s.launchTimer) clearTimeout(s.launchTimer);
    s.launchTimer = 0;
  }, []);

  useEffect(() => () => {
    const s = state.current;
    s.hovering = false;
    if (s.launchTimer) clearTimeout(s.launchTimer);
    if (s.raf) cancelAnimationFrame(s.raf);
  }, []);

  return (
    // The hover is caught on a box that never moves, and the card inside it
    // is what lifts: lifting the box itself would pull its edge out from under
    // a pointer resting on the bottom rim, and the hover would flicker.
    <div onPointerEnter={onEnter} onPointerLeave={onLeave} className={`group relative ${className}`}>
      {/* translate and scale by name in the transitions: Tailwind 4 moves and
          zooms with those properties, not transform, so a transition on
          transform would let the lift and the zoom jump. */}
      <div className="relative isolate h-full w-full overflow-hidden rounded-2xl shadow-md ring-1 ring-brand/20 transition-[translate,box-shadow] duration-300 ease-out group-hover:-translate-y-0.5 group-hover:shadow-xl group-hover:ring-brand/40 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
        <div className="h-full w-full transition-[scale,filter] duration-500 ease-out group-hover:scale-[1.04] group-hover:brightness-[0.82] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
          {children}
        </div>
        {/* The night sky the sparks glow against, strongest at the top where
            the bursts happen, clear by the foot of the card. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#08222e]/60 via-[#08222e]/25 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:transition-none"
        />
        <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
      </div>
    </div>
  );
}
