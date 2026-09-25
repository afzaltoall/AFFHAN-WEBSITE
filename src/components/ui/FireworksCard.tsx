"use client";

import { useEffect, useRef } from "react";

/**
 * A card with a fireworks show playing inside it, over whatever it holds.
 *
 * It plays by itself, the way a real display does: a shell every second or
 * so, now and then a salvo of two or three, and every 14-18s a short finale.
 * Put the pointer on it and the show comes to the pointer and quickens; click
 * and a shell bursts right there. The picture underneath is never dimmed,
 * zoomed or covered: hovering only lifts the card.
 *
 * Built to show on a bright picture. The banner this was made for is mostly
 * near-white and warm red, where additive "light" blending adds nothing and
 * white or pale gold sparks vanish, so stars are drawn normally, as soft
 * coloured glows with white-hot centres, the palettes lean on the cool colours
 * (blue, green, magenta, teal) that stand out against warm ones, and flashes
 * and crackle take colour rather than white.
 *
 * The shells are the real ones: peony, chrysanthemum (with trails), gold
 * willow (long and drooping), ring (a flat ring seen at an angle), crackle
 * (stars that pop into gold flecks) and palm (a few thick comet arms). Round
 * bursts spread their stars as a 3D shell seen from the front, so they are
 * denser at the rim, the way a real burst looks. Each shell is a little nearer
 * or farther, so bigger or smaller, and its stars change colour as they burn
 * out and flicker at the end. A burst is 70-100px across on a 112px card:
 * big, but inside the frame.
 *
 * What it costs: it starts only once the page has loaded and gone idle, runs
 * only while the card is on screen and the tab is visible (a card hidden by
 * display:none never counts as on screen), and draws each star by stamping a
 * glow image made once, so a frame allocates nothing and stays a few
 * milliseconds. Nothing plays when the visitor has asked for reduced motion.
 */

type Rgb = readonly [number, number, number];
interface Palette { main: Rgb; tip: Rgb; mainCss: string; tipCss: string }
type Kind = "peony" | "chrysanthemum" | "willow" | "ring" | "crackle" | "palm";

const palette = (main: Rgb, tip: Rgb): Palette => ({
  main, tip, mainCss: `rgb(${main.join(",")})`, tipCss: `rgb(${tip.join(",")})`,
});

// main is the colour a star burns; tip is what it turns as it burns out.
const PALETTES: readonly Palette[] = [
  palette([255, 40, 80], [255, 196, 70]),   // crimson turning gold
  palette([22, 200, 100], [150, 245, 175]), // emerald
  palette([40, 110, 245], [140, 195, 255]), // sapphire
  palette([225, 40, 200], [255, 160, 235]), // magenta
  palette([10, 170, 210], [120, 230, 250]), // Affhan teal
  palette([255, 150, 0], [255, 205, 80]),   // gold
];
const GOLD = PALETTES[5];
const WHITE: Rgb = [255, 255, 255];

// How often each shell comes up, out of 100.
const KINDS: readonly (readonly [Kind, number])[] = [
  ["peony", 22], ["chrysanthemum", 20], ["willow", 14], ["ring", 12], ["crackle", 16], ["palm", 16],
];

const MAX_STARS = 700;
const ROCKET_GRAVITY = 260; // px/s²: a rocket takes about 0.7s to reach its burst

interface Star {
  x: number; y: number; vx: number; vy: number;
  // The last three positions, for the trail: fields rather than an array, so
  // a frame allocates nothing.
  x1: number; y1: number; x2: number; y2: number; x3: number; y3: number;
  life: number; max: number;
  palette: Palette; size: number;
  drag: number; gravity: number;
  trail: boolean; twinkle: boolean;
  /** The fraction of its life left at which it pops into flecks; 0 for never. */
  crackleAt: number;
}
type NewStar = Omit<Star, "x1" | "y1" | "x2" | "y2" | "x3" | "y3">;
interface Rocket {
  x: number; y: number; vx: number; vy: number;
  apex: number; kind: Kind; palette: Palette; depth: number;
}
interface Flash { x: number; y: number; life: number; radius: number; colour: Rgb }
interface ShellOptions {
  life: readonly [number, number];
  palette?: Palette; size?: number; drag?: number; gravity?: number;
  trail?: boolean; twinkle?: boolean; crackleAt?: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const pickKind = (): Kind => {
  let n = Math.random() * 100;
  for (const [k, weight] of KINDS) { if ((n -= weight) < 0) return k; }
  return "peony";
};

/** A soft round glow in one colour, drawn once and stamped for every star. */
function glowSprite(c: Rgb): HTMLCanvasElement {
  const s = document.createElement("canvas");
  s.width = s.height = 32;
  const g = s.getContext("2d")!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},1)`);
  grad.addColorStop(0.3, `rgba(${c[0]},${c[1]},${c[2]},0.85)`);
  grad.addColorStop(0.62, `rgba(${c[0]},${c[1]},${c[2]},0.25)`);
  grad.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return s;
}

export function FireworksCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!box || !canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    let w = 0, h = 0, dpr = 1;
    let started = false;   // the page has loaded and gone idle
    let onScreen = false;  // the card is in view (never, while display:none)
    let hovering = false;
    const pointer = { x: 0, y: 0 };
    let raf = 0, last = 0;
    let timer: ReturnType<typeof setTimeout> | 0 = 0;
    const pending: ReturnType<typeof setTimeout>[] = [];
    let nextFinale = 0;
    const stars: Star[] = [];
    const rockets: Rocket[] = [];
    const flashes: Flash[] = [];

    // Keyed by the colour tuple itself, which is a constant, so a lookup
    // builds no string.
    const sprites = new Map<Rgb, HTMLCanvasElement>();
    const sprite = (c: Rgb) => {
      let s = sprites.get(c);
      if (!s) { s = glowSprite(c); sprites.set(c, s); }
      return s;
    };

    const size = () => {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };

    const running = () => started && onScreen && !document.hidden && !reduced.matches;

    // ---- the shells -------------------------------------------------------

    function addStar(s: NewStar) {
      if (stars.length >= MAX_STARS) return;
      const star = s as Star;
      star.x1 = star.x2 = star.x3 = s.x;
      star.y1 = star.y2 = star.y3 = s.y;
      stars.push(star);
    }

    function burst(x: number, y: number, kind: Kind, pal: Palette, depth: number) {
      const k = depth * (h / 112);
      // A shell of n stars flying out at `speed`, spread as a sphere seen
      // from the front, so they crowd at the rim.
      const shell = (n: number, speed: number, o: ShellOptions) => {
        for (let i = 0; i < n; i++) {
          const u = rand(-1, 1), phi = rand(0, Math.PI * 2), r = Math.sqrt(1 - u * u);
          const v = speed * rand(0.92, 1.04);
          const max = rand(o.life[0], o.life[1]);
          addStar({
            x, y, vx: Math.cos(phi) * r * v, vy: Math.sin(phi) * r * v,
            life: max, max, palette: o.palette ?? pal, size: (o.size ?? 1.7) * depth,
            drag: o.drag ?? 0.965, gravity: (o.gravity ?? 58) * k,
            trail: o.trail ?? false, twinkle: o.twinkle ?? Math.random() < 0.35,
            crackleAt: o.crackleAt ?? 0,
          });
        }
      };

      switch (kind) {
        case "peony":
          shell(96, 90 * k, { life: [1.1, 1.5] });
          break;
        case "chrysanthemum":
          shell(84, 88 * k, { life: [1.3, 1.7], trail: true });
          break;
        case "willow":
          shell(72, 70 * k, { life: [2.2, 2.9], palette: GOLD, trail: true, drag: 0.972, gravity: 40, size: 1.35, twinkle: true });
          break;
        case "ring": {
          // A flat ring tilted away from the viewer: an ellipse at an angle,
          // with a small peony at its heart.
          const n = 64, squash = rand(0.35, 0.7), tilt = rand(0, Math.PI), speed = 94 * k;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const ex = Math.cos(a) * speed, ey = Math.sin(a) * speed * squash;
            const max = rand(1.0, 1.3);
            addStar({
              x, y, vx: ex * Math.cos(tilt) - ey * Math.sin(tilt), vy: ex * Math.sin(tilt) + ey * Math.cos(tilt),
              life: max, max, palette: pal, size: 1.8 * depth, drag: 0.962, gravity: 50 * k,
              trail: false, twinkle: false, crackleAt: 0,
            });
          }
          shell(18, 34 * k, { life: [0.7, 1.0], size: 1.3 });
          break;
        }
        case "crackle":
          shell(70, 84 * k, { life: [1.0, 1.25], crackleAt: rand(0.42, 0.55) });
          break;
        case "palm": {
          // A few thick comet arms with long trails, and a fine glitter core.
          const arms = 8 + Math.floor(rand(0, 3));
          for (let i = 0; i < arms; i++) {
            const a = (i / arms) * Math.PI * 2 + rand(-0.12, 0.12);
            const v = 100 * k * rand(0.92, 1.05);
            const max = rand(1.5, 1.9);
            addStar({
              x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
              life: max, max, palette: GOLD, size: 2.6 * depth, drag: 0.968, gravity: 62 * k,
              trail: true, twinkle: false, crackleAt: 0,
            });
          }
          shell(40, 50 * k, { life: [0.8, 1.2], size: 1.2, twinkle: true });
          break;
        }
      }
      // The bloom of the burst, in its own colour: white would vanish on a
      // bright picture.
      flashes.push({ x, y, life: 0.22, radius: 34 * k, colour: kind === "willow" || kind === "palm" ? GOLD.main : pal.main });
    }

    function launch(tx?: number, ty?: number) {
      if (!w) return;
      const x = tx ?? rand(0.1, 0.9) * w;
      const apex = ty ?? rand(0.3, 0.55) * h;
      const y = h + 6;
      const vy = -Math.sqrt(2 * ROCKET_GRAVITY * Math.max(8, y - apex)) * 1.02;
      rockets.push({
        x: tx === undefined ? x : x + rand(-10, 10), y, vx: rand(-10, 10), vy, apex,
        kind: pickKind(), palette: pick(PALETTES), depth: rand(0.8, 1.15),
      });
      loop();
    }

    // ---- the show's rhythm ------------------------------------------------

    const atPointer = () =>
      launch(
        Math.min(w - 10, Math.max(10, pointer.x)),
        Math.min(h * 0.62, Math.max(h * 0.25, pointer.y)),
      );

    function fire() {
      const now = performance.now();
      if (!hovering && now >= nextFinale) {
        nextFinale = now + rand(14000, 18000);
        for (let i = 0; i < 5; i++) pending.push(setTimeout(() => running() && launch(), i * rand(150, 240)));
        return;
      }
      const one = hovering ? atPointer : () => launch();
      one();
      if (Math.random() < 0.25) {
        const extra = Math.random() < 0.5 ? 1 : 2;
        for (let i = 1; i <= extra; i++) pending.push(setTimeout(() => running() && (hovering ? atPointer() : launch()), i * rand(150, 260)));
      }
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      timer = 0;
      if (!running()) return;
      timer = setTimeout(() => {
        timer = 0;
        if (!running()) return;
        fire();
        schedule();
      }, hovering ? rand(380, 640) : rand(900, 1600));
    }

    function update() {
      if (running()) {
        if (!timer) {
          if (!nextFinale) nextFinale = performance.now() + rand(9000, 12000);
          fire();
          schedule();
        }
      } else {
        if (timer) clearTimeout(timer);
        timer = 0;
        while (pending.length) clearTimeout(pending.pop()!);
      }
      loop();
    }

    // ---- drawing ----------------------------------------------------------

    function loop() {
      if (!raf && (running() || stars.length || rockets.length || flashes.length)) {
        raf = requestAnimationFrame(frame);
      }
    }

    function frame(now: number) {
      raf = 0;
      if (!w) return;
      const dt = Math.min(0.033, last ? (now - last) / 1000 : 0.016);
      last = now;
      const c = ctx!;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      c.lineCap = "round";

      // Rockets: a bright gold head, slowing as it climbs, shedding embers.
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.vy += ROCKET_GRAVITY * dt;
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        if (Math.random() < 0.8) {
          addStar({
            x: r.x, y: r.y + 2, vx: rand(-14, 14), vy: rand(12, 34), life: 0.34, max: 0.34,
            palette: GOLD, size: 0.9, drag: 0.93, gravity: 40, trail: false, twinkle: true, crackleAt: 0,
          });
        }
        c.globalAlpha = 1;
        c.drawImage(sprite(GOLD.main), r.x - 5, r.y - 5, 10, 10);
        c.drawImage(sprite(WHITE), r.x - 1.8, r.y - 1.8, 3.6, 3.6);
        if (r.y <= r.apex || r.vy >= -10) {
          burst(r.x, r.y, r.kind, r.palette, r.depth);
          rockets.splice(i, 1);
        }
      }

      // The bloom of each burst.
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        f.life -= dt;
        if (f.life <= 0) { flashes.splice(i, 1); continue; }
        c.globalAlpha = 0.4 * (f.life / 0.22);
        c.drawImage(sprite(f.colour), f.x - f.radius, f.y - f.radius, f.radius * 2, f.radius * 2);
      }

      // Stars: trail, glow, then the white-hot centre while it still burns.
      for (let i = stars.length - 1; i >= 0; i--) {
        const p = stars[i];
        p.life -= dt;
        if (p.life <= 0) { stars.splice(i, 1); continue; }
        const f = p.life / p.max;
        if (p.crackleAt && f < p.crackleAt) {
          // Pops into three or four gold flecks and is gone.
          const n = Math.random() < 0.5 ? 3 : 4;
          for (let j = 0; j < n; j++) {
            const a = rand(0, Math.PI * 2), v = rand(24, 46);
            addStar({
              x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.1, 0.18), max: 0.18,
              palette: GOLD, size: 1.15, drag: 0.9, gravity: 20, trail: false, twinkle: true, crackleAt: 0,
            });
          }
          stars.splice(i, 1);
          continue;
        }
        const drag = Math.pow(p.drag, dt * 60);
        p.x3 = p.x2; p.y3 = p.y2; p.x2 = p.x1; p.y2 = p.y1; p.x1 = p.x; p.y1 = p.y;
        p.vx *= drag;
        p.vy = p.vy * drag + p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        let alpha = f < 0.3 ? f / 0.3 : 1;
        if (p.twinkle && f < 0.55) alpha *= rand(0.25, 1);
        const burning = f > 0.42;

        if (p.trail) {
          c.globalAlpha = alpha * 0.55;
          c.strokeStyle = burning ? p.palette.mainCss : p.palette.tipCss;
          c.lineWidth = p.size * 0.9;
          c.beginPath();
          c.moveTo(p.x3, p.y3);
          c.lineTo(p.x, p.y);
          c.stroke();
        }
        const g = p.size * 3.4;
        c.globalAlpha = alpha;
        c.drawImage(sprite(burning ? p.palette.main : p.palette.tip), p.x - g, p.y - g, g * 2, g * 2);
        if (f > 0.25) {
          const core = p.size * 1.05;
          c.globalAlpha = alpha * Math.min(1, (f - 0.25) / 0.25);
          c.drawImage(sprite(WHITE), p.x - core, p.y - core, core * 2, core * 2);
        }
      }
      c.globalAlpha = 1;

      if (running() || stars.length || rockets.length || flashes.length) loop();
      else { c.clearRect(0, 0, w, h); last = 0; }
    }

    // ---- wiring -----------------------------------------------------------

    const at = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
    };
    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      at(e);
      hovering = true;
      // One now, where the pointer is, then the quicker cadence.
      if (running()) fire();
      schedule();
    };
    const onLeave = () => { hovering = false; schedule(); };
    const onDown = (e: PointerEvent) => {
      if (!running()) return;
      at(e);
      burst(pointer.x, pointer.y, pick(["chrysanthemum", "peony", "crackle"] as const), pick(PALETTES), 1.1);
      loop();
    };
    box.addEventListener("pointerenter", onEnter);
    box.addEventListener("pointermove", at);
    box.addEventListener("pointerleave", onLeave);
    box.addEventListener("pointerdown", onDown);

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) size();
      update();
    });
    io.observe(box);
    const ro = new ResizeObserver(() => size());
    ro.observe(box);
    document.addEventListener("visibilitychange", update);
    reduced.addEventListener("change", update);

    // Only once the page has loaded and the browser has a moment to spare, so
    // the show never competes with the page's first paint.
    type IdleWindow = Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const iw = window as IdleWindow;
    let idle = 0;
    const begin = () => {
      const go = () => { started = true; update(); };
      idle = iw.requestIdleCallback ? iw.requestIdleCallback(go, { timeout: 2500 }) : window.setTimeout(go, 1200);
    };
    if (document.readyState === "complete") begin();
    else window.addEventListener("load", begin, { once: true });

    return () => {
      started = false;
      if (timer) clearTimeout(timer);
      while (pending.length) clearTimeout(pending.pop()!);
      if (raf) cancelAnimationFrame(raf);
      if (iw.cancelIdleCallback) iw.cancelIdleCallback(idle); else clearTimeout(idle);
      window.removeEventListener("load", begin);
      box.removeEventListener("pointerenter", onEnter);
      box.removeEventListener("pointermove", at);
      box.removeEventListener("pointerleave", onLeave);
      box.removeEventListener("pointerdown", onDown);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", update);
      reduced.removeEventListener("change", update);
    };
  }, []);

  return (
    // The pointer is caught on a box that never moves; the card inside it is
    // what lifts, so a pointer resting on the bottom rim cannot flicker the
    // hover. translate by name in the transition: Tailwind 4 lifts with the
    // translate property, not transform.
    <div ref={boxRef} className={`group relative ${className}`}>
      <div className="relative isolate h-full w-full overflow-hidden rounded-2xl shadow-md ring-1 ring-brand/20 transition-[translate,box-shadow] duration-300 ease-out group-hover:-translate-y-0.5 group-hover:shadow-xl group-hover:ring-brand/40 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
        {children}
        <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
      </div>
    </div>
  );
}
