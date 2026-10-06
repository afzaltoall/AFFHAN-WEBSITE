"use client";

import { useEffect, useRef } from "react";

/**
 * A card with a fireworks show playing over it, and out past its edges.
 *
 * It plays by itself, the way a real display does: a shell every second or
 * so, now and then a salvo of two or three, and every 14-18s a short finale
 * that ends in a gold willow crown. Put the pointer on it and the show comes
 * to the pointer and quickens; click and a shell bursts right there. The
 * picture underneath is never dimmed, zoomed or covered: hovering only lifts
 * the card.
 *
 * Inside a host (an ancestor marked data-fireworks-host, which is also a
 * Tailwind `group`), the card and what belongs to it are one: the pointer is
 * read on the whole host, so a pointer on a button under the card lifts it
 * and plays the show as well, its shells climbing out of the button into the
 * picture, and a press on the button bursts one above it. Keyboard focus
 * anywhere in the host lifts the card as a pointer does.
 *
 * Every stage of a real shell is drawn:
 *  1. Lift. A thin glittering tail climbs, wobbling a little and slowing.
 *  2. Break. It coasts to a near stop at the top and bursts, with a flash.
 *  3. Expansion. The stars fly out violently, as sharp streaks with white-hot
 *     heads, spread as a sphere seen from the front: crowded at the rim.
 *  4. Hang. Air drag (exponential, so the pop is quick) takes their speed;
 *     they hang, and gravity bends every trail down. A willow droops into
 *     long gold curtains.
 *  5. Effects. Stars change colour, glitter (shed gold sparks), crackle (pop
 *     into flecks), strobe, split in four (crossette), or carry an inner core
 *     in a second colour (pistil).
 *  6. End. Stars dim to dark embers, flicker, and die.
 *
 * Why streaks and not glows: an earlier version drew each star as a soft round
 * glow, and a cloud of those reads as fairy lights. A firework is seen as
 * lines: each star is drawn as the segment it moved this frame, and each
 * frame fades the last instead of wiping it, so the segments build into
 * tapered trails the way a long-exposure photograph shows them.
 *
 * The colours follow what is behind each spark. The picture has dark parts
 * and light ones, and the page around the card is pale; a deep colour sinks
 * into the dark and a pale one vanishes on the light. So the show reads a
 * coarse brightness map of the picture, and a spark over a dark part of it is
 * drawn in a bright tint of its colour, glowing the way a firework does
 * against the night, while one over a light part, or out on the page, keeps
 * the deep, saturated colour that stays visible there.
 *
 * The show reaches past the card into the page (56px to the left, stopping
 * 12px short of the hero headline; 64px to the right; 20px up and 10px down,
 * short of the navbar and the search row), some rockets go up beside the card
 * and burst above its rim, and the canvas feathers out at its edge.
 *
 * What it costs: it starts only once the page has loaded and gone idle, runs
 * only while the card is on screen and the tab is visible (a card hidden by
 * display:none never counts as on screen), draws at most ~60 frames a second,
 * and strokes all the segments of one colour, brightness and width as one
 * path, so a frame is a few dozen draw calls. Nothing plays for reduced
 * motion.
 */

interface Palette { main: string; tip: string; ember: string }
type Kind = "peony" | "pistil" | "chrysanthemum" | "willow" | "ring" | "crackle" | "palm" | "crossette" | "strobe";

// main is the colour a star burns, tip what it changes to, ember how it dies.
const CRIMSON: Palette = { main: "#e11d48", tip: "#f97316", ember: "#9a3412" };
const EMERALD: Palette = { main: "#059669", tip: "#65a30d", ember: "#3f6212" };
const ROYAL: Palette = { main: "#2563eb", tip: "#7c3aed", ember: "#4c1d95" };
const FUCHSIA: Palette = { main: "#c026d3", tip: "#db2777", ember: "#831843" };
const TEAL: Palette = { main: "#0891b2", tip: "#0d9488", ember: "#134e4a" };
const GOLD: Palette = { main: "#d97706", tip: "#b45309", ember: "#78350f" };
const SPARK = "#f59e0b"; // glitter, rocket tails, crackle flecks

// The bright tint of each colour, for a spark over a dark part of the picture.
const LIT: Readonly<Record<string, string>> = {
  "#e11d48": "#fb7185", "#f97316": "#fdba74", "#9a3412": "#fb923c",
  "#059669": "#34d399", "#65a30d": "#bef264", "#3f6212": "#84cc16",
  "#2563eb": "#60a5fa", "#7c3aed": "#c4b5fd", "#4c1d95": "#8b5cf6",
  "#c026d3": "#f0abfc", "#db2777": "#f9a8d4", "#831843": "#ec4899",
  "#0891b2": "#67e8f9", "#0d9488": "#5eead4", "#134e4a": "#14b8a6",
  "#d97706": "#fcd34d", "#b45309": "#fbbf24", "#78350f": "#f59e0b",
  [SPARK]: "#fde68a",
};
/** Below this brightness (of 255), a part of the picture counts as dark. */
const DARK_BELOW = 115;

// Cool colours come up more often: they are the ones that show on a warm picture.
const SHELL_COLOURS: readonly Palette[] = [CRIMSON, EMERALD, EMERALD, ROYAL, ROYAL, FUCHSIA, TEAL, TEAL];

// How often each shell comes up, out of 100.
const KINDS: readonly (readonly [Kind, number])[] = [
  ["peony", 14], ["pistil", 12], ["chrysanthemum", 14], ["willow", 12], ["ring", 9],
  ["crackle", 11], ["palm", 10], ["crossette", 9], ["strobe", 9],
];

/** Where the canvas reaches past the card, in CSS px. Measured on the hero,
 *  where the card has 68px to the headline, 24px to the navbar, 18px to the
 *  search row, and open page to its right. */
const SPILL = { left: 56, right: 64, top: 20, bottom: 10 } as const;
const MAX_STARS = 1000;
const ROCKET_GRAVITY = 300; // px/s²: a rocket slows as it climbs
const TRAIL_KEEP = 0.88;    // share of the last frame kept, per 60th of a second

interface Star {
  x: number; y: number; px: number; py: number; vx: number; vy: number;
  life: number; max: number;
  palette: Palette; width: number;
  /** Air drag, per second: speed falls by e^(-drag * t). */
  drag: number; gravity: number;
  head: boolean; twinkle: boolean; glitter: boolean; strobe: boolean; shift: boolean;
  /** The share of its life left at which it pops (crackle) or splits (crossette); 0 for neither. */
  popAt: number; split: boolean;
  /** Fades in over its first 0.07s: see burst(). */
  fadeIn: boolean;
}
interface Rocket {
  x: number; y: number; px: number; py: number; vx: number; vy: number; t: number;
  apex: number; kind: Kind; palette: Palette; depth: number;
}
interface Flash { x: number; y: number; life: number; radius: number; colour: string }
interface ShellOptions {
  life: readonly [number, number];
  palette?: Palette; width?: number; drag?: number; gravity?: number;
  head?: boolean; twinkle?: boolean; glitter?: boolean; strobe?: boolean; shift?: boolean;
  popAt?: number; split?: boolean; fadeIn?: boolean;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const pickKind = (): Kind => {
  let n = Math.random() * 100;
  for (const [k, weight] of KINDS) { if ((n -= weight) < 0) return k; }
  return "peony";
};

/** A star's head: white-hot centre, its colour at the rim. Drawn once per colour. */
function headSprite(colour: string): HTMLCanvasElement {
  const s = document.createElement("canvas");
  s.width = s.height = 16;
  const g = s.getContext("2d")!;
  const grad = g.createRadialGradient(8, 8, 0, 8, 8, 8);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.32, "#ffffff");
  grad.addColorStop(0.55, colour);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 16);
  return s;
}

/** The flash of a burst, in the burst's colour. */
function flashSprite(colour: string): HTMLCanvasElement {
  const s = document.createElement("canvas");
  s.width = s.height = 48;
  const g = s.getContext("2d")!;
  const grad = g.createRadialGradient(24, 24, 0, 24, 24, 24);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.18, colour);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.globalAlpha = 0.9;
  g.fillStyle = grad;
  g.fillRect(0, 0, 48, 48);
  return s;
}

// The canvas fades out over its outer edge, so sparks leaving it dissolve
// rather than being cut off by a straight line.
const FEATHER =
  "linear-gradient(to right, transparent, #000 26px, #000 calc(100% - 26px), transparent)," +
  "linear-gradient(to bottom, transparent, #000 12px, #000 calc(100% - 12px), transparent)";

/**
 * `contained` keeps the show inside the card's own rounded frame instead of
 * spilling past its edges: for a card with a neighbour (the hero's promo row
 * below xl), where sparks drifting over the next card read as a mess.
 *
 * `paused` holds the show: no shells, and a pointer or a press brings none.
 * For the trip banner while it is locked (TripLockOverlay): nothing to
 * celebrate yet. When it is lifted, the show opens with a celebration (a gold
 * burst where the lock was, a salvo across the card, a willow crown) and
 * then carries on as ever. A card that is never paused never celebrates.
 */
export function FireworksCard({
  children,
  className = "",
  contained = false,
  paused = false,
}: {
  children: React.ReactNode;
  className?: string;
  contained?: boolean;
  paused?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pausedRef = useRef(paused);
  const show = useRef<{ update: () => void; celebrate: () => void } | null>(null);

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

    const heads = new Map<string, HTMLCanvasElement>();
    const head = (c: string) => { let s = heads.get(c); if (!s) { s = headSprite(c); heads.set(c, s); } return s; };
    const blooms = new Map<string, HTMLCanvasElement>();
    const bloom = (c: string) => { let s = blooms.get(c); if (!s) { s = flashSprite(c); blooms.set(c, s); } return s; };

    // Segments are stroked in batches: one path per colour, brightness step
    // and width step. Brightness is in 8 steps, width in 0.4px steps.
    const colourIds = new Map<string, number>();
    const colourOf: string[] = [];
    for (const c of [...Object.keys(LIT), ...Object.values(LIT)]) {
      if (!colourIds.has(c)) { colourIds.set(c, colourOf.length); colourOf.push(c); }
    }

    // A coarse brightness map of the picture, so a spark over a dark part of
    // it is drawn in its bright tint (see LIT). It maps straight onto the card
    // because the picture fills it at its own shape. The image is the site's
    // own, so reading it back is allowed; if that ever fails, the map stays
    // empty and every spark keeps its deep colour.
    const GW = 64, GH = 24;
    let lumGrid: Uint8Array | null = null;
    const img = box.querySelector("img");
    const sample = () => {
      if (!img || !img.complete || !img.naturalWidth) return;
      try {
        const off = document.createElement("canvas");
        off.width = GW; off.height = GH;
        const g = off.getContext("2d", { willReadFrequently: true });
        if (!g) return;
        g.drawImage(img, 0, 0, GW, GH);
        const d = g.getImageData(0, 0, GW, GH).data;
        const grid = new Uint8Array(GW * GH);
        for (let i = 0; i < grid.length; i++) grid[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
        lumGrid = grid;
      } catch {
        lumGrid = null;
      }
    };
    sample();
    img?.addEventListener("load", sample);
    const shade = (colour: string, x: number, y: number) => {
      if (!lumGrid) return colour;
      const u = (x - card.x) / card.w, v = (y - card.y) / card.h;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) return colour; // out on the page, which is pale
      return lumGrid[Math.floor(v * GH) * GW + Math.floor(u * GW)] < DARK_BELOW ? LIT[colour] ?? colour : colour;
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

    const running = () => started && onScreen && !document.hidden && !reduced.matches && !pausedRef.current;
    const busy = () => stars.length > 0 || rockets.length > 0 || flashes.length > 0;

    // ---- the shells -------------------------------------------------------

    function addStar(s: Star) {
      if (stars.length < MAX_STARS) stars.push(s);
    }
    const star = (x: number, y: number, vx: number, vy: number, life: number, o: Partial<Star> & { palette: Palette }): Star => ({
      x, y, px: x, py: y, vx, vy, life, max: life,
      palette: o.palette, width: o.width ?? 1.15, drag: o.drag ?? 3.4, gravity: o.gravity ?? 64,
      head: o.head ?? true, twinkle: o.twinkle ?? false, glitter: o.glitter ?? false,
      strobe: o.strobe ?? false, shift: o.shift ?? false, popAt: o.popAt ?? 0, split: o.split ?? false,
      fadeIn: o.fadeIn ?? false,
    });

    function burst(x: number, y: number, kind: Kind, pal: Palette, depth: number) {
      // Speeds are for a 112px-tall card; a burst's radius is speed / drag,
      // about 50px for the main shells: big, but whole on the canvas, whose
      // top is only 20px above the card.
      // Every star of a burst fades in over its first 0.07s. Real stars leave
      // from the rim of a shell casing, so a real burst has a dark, hollow
      // centre with the streaks starting a little way out; drawn from the
      // very middle, eighty lines merge into a solid ball there, which is
      // what made an earlier version read as lights.
      const k = depth * (card.h / 112);
      const shell = (n: number, speed: number, o: ShellOptions) => {
        for (let i = 0; i < n; i++) {
          // A point on a sphere, seen from the front: crowded at the rim.
          const u = rand(-1, 1), phi = rand(0, Math.PI * 2), r = Math.sqrt(1 - u * u);
          const v = speed * rand(0.9, 1.05);
          addStar(star(x, y, Math.cos(phi) * r * v, Math.sin(phi) * r * v, rand(o.life[0], o.life[1]), {
            palette: o.palette ?? pal, width: (o.width ?? 1.15) * depth, drag: o.drag ?? 3.4,
            gravity: (o.gravity ?? 64) * k, head: o.head ?? true, twinkle: o.twinkle ?? Math.random() < 0.25,
            glitter: o.glitter ?? false, strobe: o.strobe ?? false, shift: o.shift ?? false,
            popAt: o.popAt ?? 0, split: o.split ?? false, fadeIn: true,
          }));
        }
      };

      switch (kind) {
        case "peony":
          shell(84, 175 * k, { life: [1.2, 1.6], shift: true });
          break;
        case "pistil":
          // A peony with an inner core of a second colour.
          shell(76, 175 * k, { life: [1.2, 1.6] });
          shell(26, 80 * k, { life: [0.9, 1.2], palette: pick(SHELL_COLOURS.filter((p) => p !== pal)), width: 1.0 });
          break;
        case "chrysanthemum":
          shell(80, 172 * k, { life: [1.4, 1.8], glitter: true });
          break;
        case "willow":
          shell(72, 130 * k, { life: [2.6, 3.4], palette: GOLD, drag: 2.1, gravity: 34, width: 1.0, glitter: true, twinkle: true });
          break;
        case "ring": {
          // A flat ring tilted away from the viewer, with a small heart.
          const n = 60, squash = rand(0.35, 0.7), tilt = rand(0, Math.PI), speed = 180 * k;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const ex = Math.cos(a) * speed, ey = Math.sin(a) * speed * squash;
            addStar(star(x, y, ex * Math.cos(tilt) - ey * Math.sin(tilt), ex * Math.sin(tilt) + ey * Math.cos(tilt), rand(1.1, 1.4), {
              palette: pal, width: 1.2 * depth, drag: 3.5, gravity: 56 * k, fadeIn: true,
            }));
          }
          shell(22, 70 * k, { life: [0.8, 1.1], width: 0.9 });
          break;
        }
        case "crackle":
          shell(70, 168 * k, { life: [1.1, 1.35], popAt: rand(0.4, 0.52) });
          break;
        case "palm": {
          // A few thick comet arms that glitter as they droop, and a fine core.
          const arms = 8 + Math.floor(rand(0, 3));
          for (let i = 0; i < arms; i++) {
            const a = (i / arms) * Math.PI * 2 + rand(-0.12, 0.12);
            const v = 195 * k * rand(0.92, 1.05);
            addStar(star(x, y, Math.cos(a) * v, Math.sin(a) * v, rand(1.6, 2.0), {
              palette: GOLD, width: 1.9 * depth, drag: 2.8, gravity: 70 * k, glitter: true, fadeIn: true,
            }));
          }
          shell(40, 86 * k, { life: [0.9, 1.2], width: 0.85, twinkle: true });
          break;
        }
        case "crossette":
          // Fewer, heavier stars that each split in four halfway.
          shell(24, 140 * k, { life: [1.3, 1.5], width: 1.5, popAt: rand(0.5, 0.6), split: true });
          break;
        case "strobe":
          shell(80, 168 * k, { life: [1.4, 1.8], strobe: true });
          break;
      }
      const colour = shade(kind === "willow" || kind === "palm" ? GOLD.main : pal.main, x, y);
      flashes.push({ x, y, life: 0.09, radius: 10 * k, colour });
    }

    function launch(tx?: number, ty?: number, kind?: Kind) {
      if (!card.w) return;
      // From the card's foot, or just beside the card, to burst in its upper
      // half or just above its rim, so the show spills out into the page.
      const x = tx ?? rand(card.x - 30, card.x + card.w + 44);
      const apex = ty ?? rand(card.y - 8, card.y + 0.55 * card.h);
      const y = card.y + card.h;
      const vy = -Math.sqrt(2 * ROCKET_GRAVITY * Math.max(8, y - apex)) * 1.03;
      const sx = tx === undefined ? x : x + rand(-10, 10);
      rockets.push({
        x: sx, y, px: sx, py: y, vx: rand(-10, 10), vy, t: rand(0, 6), apex,
        kind: kind ?? pickKind(), palette: pick(SHELL_COLOURS), depth: rand(0.85, 1.15),
      });
      loop();
    }

    // ---- the show's rhythm ------------------------------------------------

    /** The pointer is under the card: on its host's call to action (below). */
    const underCard = () => pointer.y > card.y + card.h;
    const atPointer = () =>
      launch(
        Math.min(card.x + card.w - 6, Math.max(card.x + 6, pointer.x)),
        // From a button under the card, the shells climb out of it into the
        // picture's upper half; over the picture, they go to the pointer.
        underCard() ? card.y + card.h * rand(0.16, 0.42) : Math.min(card.y + card.h * 0.62, Math.max(card.y + card.h * 0.12, pointer.y)),
      );

    function fire() {
      const now = performance.now();
      if (!hovering && now >= nextFinale) {
        // A quick salvo, closed by a gold willow crown over the middle.
        nextFinale = now + rand(14000, 18000);
        for (let i = 0; i < 5; i++) pending.push(setTimeout(() => running() && launch(), i * rand(140, 220)));
        pending.push(setTimeout(() => running() && launch(card.x + card.w * rand(0.4, 0.6), card.y + card.h * 0.12, "willow"), 1250));
        return;
      }
      const one = hovering ? atPointer : () => launch();
      one();
      if (Math.random() < 0.25) {
        const extra = Math.random() < 0.5 ? 1 : 2;
        for (let i = 1; i <= extra; i++) pending.push(setTimeout(() => running() && (hovering ? atPointer() : launch()), i * rand(150, 260)));
      }
    }

    /** The pause is lifted (the trip banner's lock has just broken). */
    function celebrate() {
      if (!running()) return;
      burst(card.x + card.w / 2, card.y + card.h * 0.5, "chrysanthemum", GOLD, 1.25);
      for (let i = 0; i < 6; i++) {
        pending.push(setTimeout(() => running() && launch(card.x + card.w * (0.08 + 0.168 * i) + rand(-8, 8), card.y + card.h * rand(0.08, 0.45)), 140 + i * 130));
      }
      pending.push(setTimeout(() => running() && launch(card.x + card.w * 0.5, card.y + card.h * 0.1, "willow"), 1150));
      nextFinale = performance.now() + rand(14000, 18000);
      quietFor = 0;
      loop();
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
      }, hovering ? rand(380, 640) : rand(950, 1700));
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

    // One path per (colour, brightness step, width step), rebuilt each frame.
    // Brightness is rounded up to the next eighth, so a star at full strength
    // is drawn at full strength.
    const batches = new Map<number, Path2D>();
    const segment = (colour: string, alpha: number, width: number, x0: number, y0: number, x1: number, y1: number) => {
      if (alpha < 0.04) return;
      const a = Math.min(7, Math.floor(alpha * 8));
      const wStep = Math.min(9, Math.max(1, Math.round(width / 0.4)));
      const key = colourIds.get(colour)! * 1000 + a * 10 + wStep;
      let p = batches.get(key);
      if (!p) { p = new Path2D(); batches.set(key, p); }
      p.moveTo(x0, y0);
      p.lineTo(x1 + (x1 === x0 && y1 === y0 ? 0.01 : 0), y1);
    };

    function frame(now: number) {
      raf = 0;
      if (!w) return;
      // At most ~60 frames a second, whatever the display's refresh rate:
      // this runs for as long as the card is on screen, and a 144Hz monitor
      // would otherwise draw it more than twice as often for nothing the eye
      // can use. Motion is by elapsed time, so it looks the same.
      if (last && now - last < 15) { loop(); return; }
      const dt = Math.min(0.033, last ? (now - last) / 1000 : 0.016);
      last = now;
      const c = ctx!;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);

      // The long exposure: fade what is there rather than wiping it, so each
      // frame's segments build into tapered trails.
      c.globalCompositeOperation = "destination-out";
      c.globalAlpha = 1 - Math.pow(TRAIL_KEEP, dt * 60);
      c.fillStyle = "#000";
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = "source-over";
      c.lineCap = "round";
      batches.clear();

      // Rockets: a glittering gold tail that wobbles a little as it climbs,
      // slowing, then coasting to a near stop before the break.
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.px = r.x; r.py = r.y;
        r.t += dt;
        r.vy += ROCKET_GRAVITY * dt;
        r.x += (r.vx + Math.sin(r.t * 18) * 9) * dt;
        r.y += r.vy * dt;
        segment(shade(SPARK, r.x, r.y), 1, 1.6, r.px, r.py, r.x, r.y);
        if (Math.random() < 0.75) {
          addStar(star(r.x, r.y + 1, rand(-12, 12), rand(8, 30), rand(0.25, 0.4), { palette: GOLD, width: 0.9, drag: 3.2, gravity: 42, head: false, twinkle: true }));
        }
        if (r.y <= r.apex || r.vy >= -18) {
          burst(r.x, r.y, r.kind, r.palette, r.depth);
          rockets.splice(i, 1);
        }
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
              const a = base + (j * Math.PI) / 2, v = rand(85, 115);
              addStar(star(p.x, p.y, Math.cos(a) * v, Math.sin(a) * v, rand(0.55, 0.75), { palette: p.palette, width: p.width * 0.75, drag: 3, gravity: 50 }));
            }
          } else {
            // Crackle: a few bright flecks, a pop of light, and it is gone.
            const n = Math.random() < 0.5 ? 3 : 4;
            for (let j = 0; j < n; j++) {
              const a = rand(0, Math.PI * 2), v = rand(40, 75);
              addStar(star(p.x, p.y, Math.cos(a) * v, Math.sin(a) * v, rand(0.08, 0.15), { palette: GOLD, width: 1.1, drag: 7, gravity: 20, twinkle: true }));
            }
            flashes.push({ x: p.x, y: p.y, life: 0.06, radius: 5, colour: shade(SPARK, p.x, p.y) });
          }
          stars.splice(i, 1);
          continue;
        }

        p.px = p.x; p.py = p.y;
        const drag = Math.exp(-p.drag * dt);
        p.vx *= drag;
        p.vy = p.vy * drag + p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Glitter: tiny gold sparks shed along the way, falling off it.
        if (p.glitter && f > 0.15 && Math.random() < 0.3) {
          addStar(star(p.x, p.y, rand(-7, 7), rand(4, 16), rand(0.25, 0.45), { palette: GOLD, width: 0.7, drag: 4, gravity: 40, head: false, twinkle: true }));
        }

        let alpha = f < 0.28 ? f / 0.28 : 1;
        if (p.fadeIn) alpha *= Math.min(1, (p.max - p.life) / 0.07);
        if (p.twinkle && f < 0.5) alpha *= rand(0.2, 1);
        if (p.strobe && f < 0.5 && Math.floor(now / 60 + p.max * 97) % 2) alpha = 0;
        if (alpha <= 0.02) continue;
        // It burns its colour, changes (for shells that do), then dies as an ember.
        const colour = f < 0.2 ? p.palette.ember : p.shift && f < 0.55 ? p.palette.tip : p.palette.main;
        segment(shade(colour, p.x, p.y), alpha, p.width, p.px, p.py, p.x, p.y);
      }

      // Stroke the batches.
      for (const [key, path] of batches) {
        c.globalAlpha = ((Math.floor(key / 10) % 100) + 1) / 8;
        c.strokeStyle = colourOf[Math.floor(key / 1000)];
        c.lineWidth = (key % 10) * 0.4;
        c.stroke(path);
      }

      // White-hot heads on the burning stars, and on the rockets.
      for (const p of stars) {
        const f = p.life / p.max;
        if (!p.head || f < 0.3 || (p.fadeIn && p.max - p.life < 0.07)) continue;
        if (p.strobe && f < 0.5 && Math.floor(now / 60 + p.max * 97) % 2) continue;
        const r = p.width * 1.6;
        c.globalAlpha = Math.min(1, (f - 0.3) / 0.2);
        c.drawImage(head(shade(p.shift && f < 0.55 ? p.palette.tip : p.palette.main, p.x, p.y)), p.x - r, p.y - r, r * 2, r * 2);
      }
      for (const r of rockets) {
        c.globalAlpha = 1;
        c.drawImage(head(shade(SPARK, r.x, r.y)), r.x - 2.6, r.y - 2.6, 5.2, 5.2);
      }

      // The flash of each break.
      for (let i = flashes.length - 1; i >= 0; i--) {
        const fl = flashes[i];
        fl.life -= dt;
        if (fl.life <= 0) { flashes.splice(i, 1); continue; }
        const k = fl.life / 0.09;
        const r = fl.radius * (1.25 - 0.45 * k);
        c.globalAlpha = Math.min(1, k * 0.9);
        c.drawImage(bloom(fl.colour), fl.x - r, fl.y - r, r * 2, r * 2);
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
      // A press under the card (its button) bursts in the picture above it,
      // and sends one more shell up out of the button after it.
      const under = underCard();
      const x = under ? Math.min(card.x + card.w - 12, Math.max(card.x + 12, pointer.x)) : pointer.x;
      const y = under ? card.y + card.h * 0.4 : pointer.y;
      burst(x, y, pick(["peony", "pistil", "chrysanthemum", "crackle", "strobe"] as const), pick(SHELL_COLOURS), 1.1);
      if (under) launch(x, card.y + card.h * 0.2);
      quietFor = 0;
      loop();
    };
    // The pointer is read on the card's host if it has one: the card and
    // what belongs to it (data-fireworks-host), so a pointer on its button
    // under it plays the show as a pointer on the card does.
    const host = box.closest<HTMLElement>("[data-fireworks-host]") ?? box;
    host.addEventListener("pointerenter", onEnter);
    host.addEventListener("pointermove", at);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerdown", onDown);

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
    show.current = { update, celebrate };

    return () => {
      show.current = null;
      started = false;
      if (timer) clearTimeout(timer);
      while (pending.length) clearTimeout(pending.pop()!);
      if (raf) cancelAnimationFrame(raf);
      if (iw.cancelIdleCallback) iw.cancelIdleCallback(idle); else clearTimeout(idle);
      window.removeEventListener("load", begin);
      host.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("pointermove", at);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", update);
      reduced.removeEventListener("change", update);
      img?.removeEventListener("load", sample);
    };
  }, []);

  // Paused or not (see above): held, or let go with a celebration.
  useEffect(() => {
    const was = pausedRef.current;
    pausedRef.current = paused;
    if (was === paused) return;
    show.current?.update();
    if (was) show.current?.celebrate();
  }, [paused]);

  return (
    // The pointer is caught on a box that never moves, the size of the card;
    // the card inside it is what lifts, so a pointer resting on the bottom rim
    // cannot flicker the hover. translate by name in the transition: Tailwind
    // 4 lifts with the translate property, not transform.
    <div ref={boxRef} className={`group relative ${className}`}>
      <div className="relative isolate h-full w-full overflow-hidden rounded-2xl shadow-md ring-1 ring-brand/20 transition-[translate,box-shadow] duration-300 ease-out group-hover:-translate-y-0.5 group-hover:shadow-xl group-hover:ring-brand/40 group-has-[:focus-visible]:-translate-y-0.5 group-has-[:focus-visible]:shadow-xl group-has-[:focus-visible]:ring-brand/40 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-has-[:focus-visible]:translate-y-0">
        {children}
      </div>
      {/* Outside the card's clip, and larger than it by SPILL, so the show
          can spill past its edges; feathered, so it fades out there. When
          contained, exactly the card, and rounded like it. */}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`pointer-events-none absolute z-10 ${contained ? "rounded-2xl" : ""}`}
        style={
          contained
            ? { left: 0, top: 0, width: "100%", height: "100%" }
            : {
                left: -SPILL.left, top: -SPILL.top,
                width: `calc(100% + ${SPILL.left + SPILL.right}px)`, height: `calc(100% + ${SPILL.top + SPILL.bottom}px)`,
                maskImage: FEATHER, WebkitMaskImage: FEATHER,
                maskComposite: "intersect", WebkitMaskComposite: "source-in",
              }
        }
      />
    </div>
  );
}
