"use client";

import { useEffect, useRef } from "react";

/**
 * A card with a fireworks show playing over it, and out past its edges.
 *
 * It plays by itself, the way a real display does: a shell every second or
 * so, now and then a salvo of two or three, and every 14-18s a short finale.
 * Put the pointer on it and the show comes to the pointer and quickens; click
 * and a shell bursts right there. The picture underneath is never dimmed,
 * zoomed or covered: hovering only lifts the card.
 *
 * The show is not kept inside the card. The canvas reaches past it into the
 * page (44px to the left, which stops 8px short of the hero headline; 64px to
 * the right; 20px up and 16px down, which stop short of the navbar and the
 * search row), some rockets go up beside the card and burst above its rim, and
 * the canvas feathers out over its last stretch, so sparks leaving it dissolve
 * rather than being cut off by a line.
 *
 * What makes it read as real fireworks rather than confetti:
 *  - Long-exposure trails. Each frame fades the last one instead of wiping
 *    it, so every star draws its own glowing streak, which is how fireworks
 *    look to the eye and in every photograph of them.
 *  - The physics of a shell: a violent pop, then the stars hang as air drag
 *    takes their speed (exponential drag, so the burst is fast and brief),
 *    then droop and fall under gravity.
 *  - A round burst is a 3D shell seen from the front, so its stars crowd at
 *    the rim. Shells come nearer and farther, so bigger and smaller.
 *  - Stars change colour as they burn, and die as dim orange embers. Some
 *    shells glitter (shed tiny gold sparks), some strobe at the end, crackle
 *    pops into flecks, crossette splits each star in four.
 *  - Built to show on a bright picture, which the banner is: stars are drawn
 *    as coloured glows (additive light would vanish on near-white) with
 *    white-hot centres, and the palettes lean on the cool colours that stand
 *    out against its warm ones.
 *
 * What it costs: it starts only once the page has loaded and gone idle, runs
 * only while the card is on screen and the tab is visible (a card hidden by
 * display:none never counts as on screen), and stamps pre-made glow images,
 * so a frame stays a few milliseconds. Nothing plays for reduced motion.
 */

type Rgb = readonly [number, number, number];
interface Palette { main: Rgb; tip: Rgb }
type Kind = "peony" | "chrysanthemum" | "willow" | "ring" | "crackle" | "palm" | "crossette" | "strobe";

// main is the colour a star burns; tip is what it turns as it burns out.
const PALETTES: readonly Palette[] = [
  { main: [255, 40, 80], tip: [255, 190, 70] },   // crimson turning gold
  { main: [22, 200, 100], tip: [150, 245, 175] }, // emerald
  { main: [40, 110, 245], tip: [140, 195, 255] }, // sapphire
  { main: [225, 40, 200], tip: [255, 160, 235] }, // magenta
  { main: [10, 170, 210], tip: [120, 230, 250] }, // Affhan teal
  { main: [255, 150, 0], tip: [255, 205, 80] },   // gold
];
const GOLD = PALETTES[5];
const EMBER: Rgb = [230, 90, 20];
const WHITE: Rgb = [255, 255, 255];

// How often each shell comes up, out of 100.
const KINDS: readonly (readonly [Kind, number])[] = [
  ["peony", 18], ["chrysanthemum", 16], ["willow", 12], ["ring", 10],
  ["crackle", 12], ["palm", 12], ["crossette", 10], ["strobe", 10],
];

/** Where the canvas reaches past the card, in CSS px. Measured on the hero,
 *  where the card has 52px to the headline, 24px to the navbar, 27px to the
 *  search row, and open page to its right. */
const SPILL = { left: 44, right: 64, top: 20, bottom: 16 } as const;
const MAX_STARS = 900;
const ROCKET_GRAVITY = 300;       // px/s²: a rocket slows as it climbs
const TRAIL_KEEP = 0.8;           // share of the last frame kept, per 60th of a second

interface Star {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  palette: Palette; size: number;
  /** Air drag, per second: speed falls by e^-drag*t. */
  drag: number; gravity: number;
  twinkle: boolean; glitter: boolean; strobe: boolean;
  /** The share of its life left at which it pops (crackle) or splits (crossette); 0 for neither. */
  popAt: number; split: boolean;
}
interface Rocket {
  x: number; y: number; vx: number; vy: number;
  apex: number; kind: Kind; palette: Palette; depth: number;
}
interface Flash { x: number; y: number; life: number; radius: number; colour: Rgb }
interface ShellOptions {
  life: readonly [number, number];
  palette?: Palette; size?: number; drag?: number; gravity?: number;
  twinkle?: boolean; glitter?: boolean; strobe?: boolean; popAt?: number; split?: boolean;
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

// The canvas fades out over its outer edge, so sparks leaving it dissolve
// rather than being cut off by a straight line.
const FEATHER =
  "linear-gradient(to right, transparent, #000 26px, #000 calc(100% - 26px), transparent)," +
  "linear-gradient(to bottom, transparent, #000 12px, #000 calc(100% - 12px), transparent)";

export function FireworksCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!box || !canvas || !ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    // Canvas size, and the card's place inside it (all CSS px).
    let w = 0, h = 0, dpr = 1;
    const card = { x: 0, y: 0, w: 0, h: 0 };
    let started = false;   // the page has loaded and gone idle
    let onScreen = false;  // the card is in view (never, while display:none)
    let hovering = false;
    const pointer = { x: 0, y: 0 };
    let raf = 0, last = 0, quietFor = 0;
    let timer: ReturnType<typeof setTimeout> | 0 = 0;
    const pending: ReturnType<typeof setTimeout>[] = [];
    let nextFinale = 0;
    const stars: Star[] = [];
    const rockets: Rocket[] = [];
    const flashes: Flash[] = [];

    const sprites = new Map<Rgb, HTMLCanvasElement>();
    const sprite = (c: Rgb) => {
      let s = sprites.get(c);
      if (!s) { s = glowSprite(c); sprites.set(c, s); }
      return s;
    };

    const size = () => {
      const r = canvas.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      if (!r.width || !b.width) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width; h = r.height;
      card.x = b.left - r.left; card.y = b.top - r.top; card.w = b.width; card.h = b.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };

    const running = () => started && onScreen && !document.hidden && !reduced.matches;
    const busy = () => stars.length > 0 || rockets.length > 0 || flashes.length > 0;

    // ---- the shells -------------------------------------------------------

    function addStar(s: Star) {
      if (stars.length < MAX_STARS) stars.push(s);
    }

    function burst(x: number, y: number, kind: Kind, pal: Palette, depth: number) {
      // Speeds are for a 112px-tall card; a burst's radius is speed / drag.
      const k = depth * (card.h / 112);
      const shell = (n: number, speed: number, o: ShellOptions) => {
        for (let i = 0; i < n; i++) {
          // A point on a sphere, seen from the front: crowded at the rim.
          const u = rand(-1, 1), phi = rand(0, Math.PI * 2), r = Math.sqrt(1 - u * u);
          const v = speed * rand(0.9, 1.05);
          const max = rand(o.life[0], o.life[1]);
          addStar({
            x, y, vx: Math.cos(phi) * r * v, vy: Math.sin(phi) * r * v,
            life: max, max, palette: o.palette ?? pal, size: (o.size ?? 1.6) * depth,
            drag: o.drag ?? 3.1, gravity: (o.gravity ?? 60) * k,
            twinkle: o.twinkle ?? Math.random() < 0.3, glitter: o.glitter ?? false, strobe: o.strobe ?? false,
            popAt: o.popAt ?? 0, split: o.split ?? false,
          });
        }
      };

      switch (kind) {
        case "peony":
          shell(100, 170 * k, { life: [1.1, 1.5] });
          break;
        case "chrysanthemum":
          shell(88, 165 * k, { life: [1.3, 1.7], glitter: true });
          break;
        case "willow":
          shell(76, 120 * k, { life: [2.4, 3.1], palette: GOLD, drag: 1.9, gravity: 36, size: 1.3, twinkle: true, glitter: true });
          break;
        case "ring": {
          // A flat ring tilted away from the viewer, with a small heart.
          const n = 64, squash = rand(0.35, 0.7), tilt = rand(0, Math.PI), speed = 175 * k;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const ex = Math.cos(a) * speed, ey = Math.sin(a) * speed * squash;
            const max = rand(1.0, 1.3);
            addStar({
              x, y, vx: ex * Math.cos(tilt) - ey * Math.sin(tilt), vy: ex * Math.sin(tilt) + ey * Math.cos(tilt),
              life: max, max, palette: pal, size: 1.7 * depth, drag: 3.2, gravity: 52 * k,
              twinkle: false, glitter: false, strobe: false, popAt: 0, split: false,
            });
          }
          shell(20, 60 * k, { life: [0.7, 1.0], size: 1.2 });
          break;
        }
        case "crackle":
          shell(72, 160 * k, { life: [1.0, 1.25], popAt: rand(0.42, 0.55) });
          break;
        case "palm": {
          // A few thick comet arms that glitter as they droop, and a fine core.
          const arms = 8 + Math.floor(rand(0, 3));
          for (let i = 0; i < arms; i++) {
            const a = (i / arms) * Math.PI * 2 + rand(-0.12, 0.12);
            const v = 190 * k * rand(0.92, 1.05);
            const max = rand(1.5, 1.9);
            addStar({
              x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
              life: max, max, palette: GOLD, size: 2.5 * depth, drag: 2.6, gravity: 64 * k,
              twinkle: false, glitter: true, strobe: false, popAt: 0, split: false,
            });
          }
          shell(40, 90 * k, { life: [0.8, 1.2], size: 1.1, twinkle: true });
          break;
        }
        case "crossette":
          // Fewer, bigger stars that each split in four halfway.
          shell(22, 130 * k, { life: [1.2, 1.4], size: 2.0, popAt: rand(0.5, 0.6), split: true, twinkle: false });
          break;
        case "strobe":
          shell(90, 160 * k, { life: [1.3, 1.7], strobe: true, twinkle: false });
          break;
      }
      // The bloom of the burst, in its own colour: white would vanish on a
      // bright picture.
      flashes.push({ x, y, life: 0.16, radius: 44 * k, colour: kind === "willow" || kind === "palm" ? GOLD.main : pal.main });
    }

    function launch(tx?: number, ty?: number) {
      if (!card.w) return;
      // From the card's foot, or just beside the card, to burst in its upper
      // half or just above its rim, so the show spills out into the page.
      const x = tx ?? rand(card.x - 20, card.x + card.w + 36);
      const apex = ty ?? rand(card.y - 10, card.y + 0.5 * card.h);
      const y = card.y + card.h;
      const vy = -Math.sqrt(2 * ROCKET_GRAVITY * Math.max(8, y - apex)) * 1.02;
      rockets.push({
        x: tx === undefined ? x : x + rand(-10, 10), y, vx: rand(-12, 12), vy, apex,
        kind: pickKind(), palette: pick(PALETTES), depth: rand(0.85, 1.15),
      });
      loop();
    }

    // ---- the show's rhythm ------------------------------------------------

    const atPointer = () =>
      launch(
        Math.min(card.x + card.w - 6, Math.max(card.x + 6, pointer.x)),
        Math.min(card.y + card.h * 0.62, Math.max(card.y + card.h * 0.12, pointer.y)),
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
      if (!raf && (running() || busy() || quietFor < 0.8)) raf = requestAnimationFrame(frame);
    }

    function frame(now: number) {
      raf = 0;
      if (!w) return;
      const dt = Math.min(0.033, last ? (now - last) / 1000 : 0.016);
      last = now;
      const c = ctx!;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);

      // The long exposure: fade what is there rather than wiping it.
      c.globalCompositeOperation = "destination-out";
      c.globalAlpha = 1 - Math.pow(TRAIL_KEEP, dt * 60);
      c.fillStyle = "#000";
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = "source-over";

      // Rockets: a bright gold head, slowing as it climbs, shedding embers.
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.vy += ROCKET_GRAVITY * dt;
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        if (Math.random() < 0.7) {
          addStar({
            x: r.x, y: r.y + 2, vx: rand(-16, 16), vy: rand(10, 36), life: 0.32, max: 0.32,
            palette: GOLD, size: 0.8, drag: 3, gravity: 40,
            twinkle: true, glitter: false, strobe: false, popAt: 0, split: false,
          });
        }
        c.globalAlpha = 1;
        c.drawImage(sprite(GOLD.main), r.x - 4.5, r.y - 4.5, 9, 9);
        c.drawImage(sprite(WHITE), r.x - 1.6, r.y - 1.6, 3.2, 3.2);
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
        const k = f.life / 0.16;
        c.globalAlpha = 0.5 * k;
        const r = f.radius * (1.2 - 0.4 * k);
        c.drawImage(sprite(f.colour), f.x - r, f.y - r, r * 2, r * 2);
      }

      // Stars.
      for (let i = stars.length - 1; i >= 0; i--) {
        const p = stars[i];
        p.life -= dt;
        if (p.life <= 0) { stars.splice(i, 1); continue; }
        const f = p.life / p.max;

        if (p.popAt && f < p.popAt) {
          if (p.split) {
            // Crossette: four stars off at right angles to its course.
            const base = Math.atan2(p.vy, p.vx) + Math.PI / 4;
            for (let j = 0; j < 4; j++) {
              const a = base + (j * Math.PI) / 2, v = rand(70, 95);
              const max = rand(0.55, 0.75);
              addStar({
                x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max,
                palette: p.palette, size: p.size * 0.75, drag: 2.8, gravity: 50,
                twinkle: false, glitter: false, strobe: false, popAt: 0, split: false,
              });
            }
          } else {
            // Crackle: three or four gold flecks, and it is gone.
            const n = Math.random() < 0.5 ? 3 : 4;
            for (let j = 0; j < n; j++) {
              const a = rand(0, Math.PI * 2), v = rand(30, 60);
              addStar({
                x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.09, 0.16), max: 0.16,
                palette: GOLD, size: 1.05, drag: 6, gravity: 20,
                twinkle: true, glitter: false, strobe: false, popAt: 0, split: false,
              });
            }
          }
          stars.splice(i, 1);
          continue;
        }

        const drag = Math.exp(-p.drag * dt);
        p.vx *= drag;
        p.vy = p.vy * drag + p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Glitter sheds tiny gold sparks that fall away.
        if (p.glitter && f > 0.2 && Math.random() < 0.22) {
          addStar({
            x: p.x, y: p.y, vx: rand(-8, 8), vy: rand(4, 18), life: 0.28, max: 0.28,
            palette: GOLD, size: 0.7, drag: 4, gravity: 30,
            twinkle: true, glitter: false, strobe: false, popAt: 0, split: false,
          });
        }

        let alpha = f < 0.3 ? f / 0.3 : 1;
        if (p.twinkle && f < 0.55) alpha *= rand(0.25, 1);
        if (p.strobe && f < 0.5 && Math.floor(now / 55 + p.max * 97) % 2) alpha *= 0.06;
        if (alpha < 0.02) continue;
        // Burning colour, then the burn-out colour, then an ember.
        const colour = f > 0.45 ? p.palette.main : f > 0.18 ? p.palette.tip : EMBER;
        const g = p.size * 3.2;
        c.globalAlpha = alpha;
        c.drawImage(sprite(colour), p.x - g, p.y - g, g * 2, g * 2);
        if (f > 0.3) {
          const core = p.size;
          c.globalAlpha = alpha * Math.min(1, (f - 0.3) / 0.2);
          c.drawImage(sprite(WHITE), p.x - core, p.y - core, core * 2, core * 2);
        }
      }
      c.globalAlpha = 1;

      // Once nothing is left, let the trails finish fading, then clear
      // outright (a fade never quite reaches zero) and stop.
      quietFor = busy() ? 0 : quietFor + dt;
      if (running() || busy() || quietFor < 0.8) loop();
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
      burst(pointer.x, pointer.y, pick(["chrysanthemum", "peony", "crackle", "strobe"] as const), pick(PALETTES), 1.1);
      quietFor = 0;
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
    // The pointer is caught on a box that never moves, the size of the card;
    // the card inside it is what lifts, so a pointer resting on the bottom rim
    // cannot flicker the hover. translate by name in the transition: Tailwind
    // 4 lifts with the translate property, not transform.
    <div ref={boxRef} className={`group relative ${className}`}>
      <div className="relative isolate h-full w-full overflow-hidden rounded-2xl shadow-md ring-1 ring-brand/20 transition-[translate,box-shadow] duration-300 ease-out group-hover:-translate-y-0.5 group-hover:shadow-xl group-hover:ring-brand/40 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
        {children}
      </div>
      {/* Outside the card's clip, and larger than it by SPILL, so the show
          can spill past its edges; feathered, so it fades out there. */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute z-10"
        style={{
          left: -SPILL.left, top: -SPILL.top,
          width: `calc(100% + ${SPILL.left + SPILL.right}px)`, height: `calc(100% + ${SPILL.top + SPILL.bottom}px)`,
          maskImage: FEATHER, WebkitMaskImage: FEATHER,
          maskComposite: "intersect", WebkitMaskComposite: "source-in",
        }}
      />
    </div>
  );
}
