"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface DrawGlobeHandle {
  /** A ticket in through the opening at the top; `mine`, the visitor's own, which glows. */
  drop(mine?: boolean): void;
  /** A ticket is on its way from elsewhere on the page: the lid opens for it. */
  expect(): void;
  /** One ticket in the globe catches the light for a moment (a registration being told of). */
  glint(): void;
  /** Where the opening is on the screen, for a ticket flying in from elsewhere on the page. */
  opening(): { x: number; y: number } | null;
}

interface Ticket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Turned in the plane of the picture. */
  a: number;
  va: number;
  /** Flipped over, the paper turning in the air, and how fast this one turns. */
  f: number;
  ff: number;
  /** How hard the air takes this one, 0 to 1. */
  lift: number;
  mine: boolean;
  /** Falling in through the opening: not yet held by the glass. */
  entering: boolean;
  shade: number;
  /** Catching the light, 1 fading to 0. */
  glint: number;
}

interface Sim {
  tickets: Ticket[];
  queue: boolean[];
  size: number;
  spin: number;
  spinTarget: number;
  boost: number;
  turn: number;
  flash: number;
  lastPour: number;
  /** The lid: 0 shut, 1 open (a spring, so it overshoots a little), and until when it is held open. */
  lid: number;
  lidV: number;
  lidUntil: number;
  /** The air mixing the tickets: its strength now, the gust under way, the next one. */
  air: number;
  gust: { t: number; power: number } | null;
  gustAt: { at: number; power: number } | null;
  nextGust: number;
  mineIn: boolean;
  clock: number;
  visible: boolean;
  draw: () => void;
  wake: () => void;
  blow: (power: number) => void;
}

/** Tickets drawn at most; the caption beside the globe says how many there are. */
const MAX = 150;
const SHADES = ["#e9c675", "#dcb265", "#f1d58f", "#d6a952"];
/** Their backs, a shade darker, seen as they turn over. */
const BACKS = ["#b98d3f", "#ad8136", "#c39a4c", "#a97c31"];
/** How long a gust of air lasts; between them, on its own, a gentler one every 10 to 16 seconds. */
const GUST_S = 1.9;
const IDLE_GUST = { from: 10_000, spread: 6000, power: 0.7 };
/** The lid opens to about 105 degrees, and stays open this long after the last ticket in. */
const LID_OPEN = 1.83;
const LID_HOLD = 900;
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The draw, as a golden glass globe on a stand: one golden ticket in it for
 * each registration (`count`, the real figure), the visitor's own (`mine`)
 * glowing and marked "You". The owner's idea of 2026-10-07: every
 * registration goes into one globe, and five are drawn from it.
 *
 * The lid at the top opens for tickets and shuts after them. The first time
 * the globe is seen the tickets pour in, one after another; `drop()` drops
 * another in at any time (a registration arriving while the page is open,
 * or the visitor's own, flying in from their boarding pass), and `expect()`
 * opens the lid for one on its way. Every so often, and after each ticket
 * comes in, air rises through the globe as in a draw machine: the tickets
 * lift off the heap, swirl and turn over, and settle again. A pointer on it
 * turns it faster; a press sends the air through it.
 *
 * Drawn on a canvas, with a little physics: gravity, the glass, the turning
 * wall carrying the heap up the side until it slides back, the air, and the
 * tickets pushing each other apart. It runs only while it is in view and the
 * tab is visible. It fills its wrap, square, as large as the wrap allows.
 * Under reduced motion the tickets lie at rest inside a still globe, its lid
 * shut. For screen readers it is one picture with its words (`label`).
 */
export const DrawGlobe = forwardRef<DrawGlobeHandle, { count: number; mine: boolean; holdMine: boolean; label: string; shakeLabel: string }>(
  function DrawGlobe({ count, mine, holdMine, label, shakeLabel }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sim = useRef<Sim | null>(null);

    useImperativeHandle(ref, () => ({
      drop(isMine = false) {
        const s = sim.current;
        if (!s) return;
        s.queue.push(isMine);
        s.wake();
      },
      expect() {
        const s = sim.current;
        if (!s) return;
        s.lidUntil = Math.max(s.lidUntil, performance.now() + 2400);
        s.wake();
      },
      glint() {
        const s = sim.current;
        if (!s || reduced()) return;
        const pool = s.tickets.filter((t) => !t.mine && !t.entering);
        const t = pool[Math.floor(Math.random() * pool.length)];
        if (!t) return;
        t.glint = 1;
        s.wake();
      },
      opening() {
        const c = canvasRef.current;
        const s = sim.current;
        if (!c || !s) return null;
        const r = c.getBoundingClientRect();
        const { cx, cy, R } = geometry(s.size);
        return { x: r.left + cx, y: r.top + cy - R };
      },
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const still = reduced();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const n = Math.min(count, MAX);
      // The visitor's ticket, unless it is about to fly in, goes in last of the first pour.
      const queue: boolean[] = Array.from({ length: Math.max(0, n - (mine ? 1 : 0)) }, () => false);
      if (mine && !holdMine) queue.push(true);

      const s: Sim = {
        tickets: [],
        queue,
        size: 0,
        spin: 0.45,
        spinTarget: 0.45,
        boost: 0,
        turn: 0,
        flash: 0,
        lastPour: 0,
        lid: 0,
        lidV: 0,
        lidUntil: 0,
        air: 0,
        gust: null,
        gustAt: null,
        nextGust: Infinity,
        mineIn: false,
        clock: 0,
        visible: false,
        draw: () => {},
        wake: () => {},
        blow: () => {},
      };
      sim.current = s;

      // Square, as large as the wrap allows; what is already in the globe scales with it.
      const fit = () => {
        const box = canvas.parentElement;
        const w = box?.clientWidth || 300;
        const h = box?.clientHeight || w;
        const size = Math.max(160, Math.round(Math.min(w, h, 620)));
        if (size === s.size) return;
        const k = s.size ? size / s.size : 1;
        for (const t of s.tickets) {
          t.x *= k;
          t.y *= k;
          t.vx *= k;
          t.vy *= k;
        }
        s.size = size;
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
      };
      fit();

      // Larger while there are few, smaller as the globe fills, so the heap always looks a heap.
      const ticketSize = () => {
        const { R } = geometry(s.size);
        const total = Math.max(30, s.tickets.length + s.queue.length);
        const tw = R * Math.max(0.085, 0.2 * Math.sqrt(30 / total));
        return { tw, th: tw * 0.56, r: tw * 0.43 };
      };

      const spawn = (isMine: boolean, now: number, settled = false) => {
        const { cx, cy, R } = geometry(s.size);
        const { th } = ticketSize();
        const ticket = {
          a: Math.random() * Math.PI,
          f: 0,
          ff: (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 6),
          lift: Math.random(),
          mine: isMine,
          shade: Math.floor(Math.random() * SHADES.length),
          glint: 0,
        };
        if (settled) {
          // At rest in the bowl of the globe (reduced motion): somewhere in its lower half.
          const ang = Math.PI * (0.15 + Math.random() * 0.7);
          const rr = R * (0.25 + Math.random() * 0.6);
          s.tickets.push({ ...ticket, x: cx + Math.cos(ang) * rr * 0.9, y: cy + Math.sin(ang) * rr * 0.75, vx: 0, vy: 0, va: 0, entering: false });
        } else {
          s.tickets.push({ ...ticket, x: cx + (Math.random() - 0.5) * R * 0.08, y: cy - R - th * 1.5, vx: (Math.random() - 0.5) * R * 0.3, vy: R * 1.6, va: (Math.random() - 0.5) * 8, entering: true });
          s.boost = Math.max(s.boost, isMine ? 1.9 : 0.9);
          s.flash = 1;
          s.lidUntil = Math.max(s.lidUntil, now + LID_HOLD);
        }
        if (isMine) s.mineIn = true;
        canvas.dataset.tickets = String(s.tickets.length);
      };

      // A gust of air up through the globe; one under way is made stronger and lasts longer.
      s.blow = (power: number) => {
        if (s.gust) {
          s.gust.power = Math.max(s.gust.power, power);
          s.gust.t = Math.min(s.gust.t, GUST_S * 0.3);
        } else s.gust = { t: 0, power };
        s.wake();
      };

      const step = (h: number) => {
        const { cx, cy, R } = geometry(s.size);
        const { r } = ticketSize();
        const G = R * 6;
        // The glass carries the heap no faster than this, however fast its lines turn (a pointer on
        // it, a ticket landing): faster, the heap would ride up the side as a chain.
        const wall = Math.min(s.spin, 0.55) * R;
        const air = s.air;
        for (const t of s.tickets) {
          t.vy += G * h;
          if (air > 0 && !t.entering) {
            const dx = t.x - cx;
            const dy = t.y - cy;
            const d = Math.hypot(dx, dy) || 1;
            // The air comes up from the foot, strongest low in the globe, and swirls round the
            // way the glass turns; each ticket takes it a little differently.
            const low = Math.max(0, Math.min(1, 0.4 + 0.6 * (dy / R + 0.35)));
            t.vy -= G * air * (1.15 + 0.4 * t.lift) * low * h;
            t.vx += (-dy / d) * R * 3.2 * air * h;
            t.vy += (dx / d) * R * 3.2 * air * h;
            t.vx += (Math.random() - 0.5) * R * 18 * air * h;
            t.vy += (Math.random() - 0.5) * R * 18 * air * h;
            t.va += (Math.random() - 0.5) * 40 * air * h;
          }
          t.vx *= 1 - (0.2 + 1.4 * air) * h;
          t.vy *= 1 - (0.06 + 1.4 * air) * h;
          t.x += t.vx * h;
          t.y += t.vy * h;
          t.a += t.va * h;
          t.va *= 1 - 1.6 * h;
          // Paper turns over as it flies, and lies flat again once it stops.
          const moving = Math.max(0, Math.min(1, (Math.hypot(t.vx, t.vy) - R * 0.5) / R));
          if (moving > 0) t.f += t.ff * moving * h;
          else t.f += (Math.round(t.f / Math.PI) * Math.PI - t.f) * Math.min(1, 6 * h);
          const dx = t.x - cx;
          const dy = t.y - cy;
          const d = Math.hypot(dx, dy) || 1;
          if (t.entering) {
            if (d < R - r * 1.5) t.entering = false;
            continue;
          }
          if (d > R - r) {
            const nx = dx / d;
            const ny = dy / d;
            t.x = cx + nx * (R - r);
            t.y = cy + ny * (R - r);
            const vn = t.vx * nx + t.vy * ny;
            if (vn > 0) {
              t.vx -= 1.32 * vn * nx;
              t.vy -= 1.32 * vn * ny;
            }
            // The turning glass carries what lies on it, but only up the lower half: past it the
            // side is too steep to hold, and the tickets tumble back, as in a draw drum.
            const tx = -ny;
            const ty = nx;
            const vt = t.vx * tx + t.vy * ty;
            const grip = 0.07 * Math.max(0, Math.min(1, ny + 0.1));
            const dv = (wall - vt) * grip;
            t.vx += dv * tx;
            t.vy += dv * ty;
            t.va += (vt - wall) * 0.015;
          }
        }
        // Tickets push each other apart.
        const min = r * 2;
        const T = s.tickets;
        for (let i = 0; i < T.length; i++) {
          const a = T[i];
          if (a.entering) continue;
          for (let j = i + 1; j < T.length; j++) {
            const b = T[j];
            if (b.entering) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d2 = dx * dx + dy * dy;
            if (d2 >= min * min || d2 === 0) continue;
            const d = Math.sqrt(d2);
            const nx = dx / d;
            const ny = dy / d;
            const push = (min - d) / 2;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
            const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rv < 0) {
              const k = (-1.15 * rv) / 2;
              a.vx -= k * nx;
              a.vy -= k * ny;
              b.vx += k * nx;
              b.vy += k * ny;
            }
          }
        }
      };

      const draw = () => {
        const S = s.size;
        const { cx, cy, R } = geometry(S);
        const { tw, th } = ticketSize();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, S, S);
        const foot = Math.min(S - 6, cy + R * 1.3);

        // Gold light about the globe, brighter for a moment as a ticket comes in, and the pool of
        // it on the floor under the stand.
        const halo = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, S * 0.5);
        halo.addColorStop(0, `rgba(242, 200, 120, ${0.16 + 0.12 * s.flash + 0.06 * s.air})`);
        halo.addColorStop(1, "rgba(242, 200, 120, 0)");
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, S, S);
        ctx.save();
        ctx.translate(cx, foot - R * 0.03);
        ctx.scale(1, 0.18);
        const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.95);
        pool.addColorStop(0, "rgba(255, 214, 140, 0.3)");
        pool.addColorStop(1, "rgba(255, 214, 140, 0)");
        ctx.fillStyle = pool;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.95, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // The stand: a neck and a wide foot, in polished gold.
        const metal = ctx.createLinearGradient(cx - R * 0.6, 0, cx + R * 0.6, 0);
        metal.addColorStop(0, "#6f5018");
        metal.addColorStop(0.35, "#e6c06a");
        metal.addColorStop(0.5, "#fff0c4");
        metal.addColorStop(0.65, "#d4a548");
        metal.addColorStop(1, "#6f5018");
        ctx.fillStyle = metal;
        const neckTop = cy + R * 0.93;
        ctx.beginPath();
        ctx.moveTo(cx - R * 0.16, neckTop);
        ctx.lineTo(cx + R * 0.16, neckTop);
        ctx.lineTo(cx + R * 0.28, foot - R * 0.06);
        ctx.lineTo(cx - R * 0.28, foot - R * 0.06);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx, foot - R * 0.04, R * 0.6, R * 0.085, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.ellipse(cx, foot - R * 0.075, R * 0.5, R * 0.035, 0, 0, Math.PI * 2);
        ctx.fill();
        // The collar the globe sits in.
        ctx.strokeStyle = metal;
        ctx.lineWidth = Math.max(2, R * 0.035);
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.02, Math.PI * 0.22, Math.PI * 0.78);
        ctx.stroke();

        // The glass, clear and touched with gold: lit from below by the stand, brightest at its
        // edge where it is seen most obliquely.
        const body = ctx.createRadialGradient(cx - R * 0.2, cy + R * 0.25, R * 0.05, cx, cy, R);
        body.addColorStop(0, `rgba(255, 216, 150, ${0.16 + 0.1 * s.flash})`);
        body.addColorStop(0.55, "rgba(255, 210, 140, 0.05)");
        body.addColorStop(0.85, "rgba(255, 220, 160, 0.09)");
        body.addColorStop(1, "rgba(255, 236, 190, 0.34)");
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fill();

        // The gold lines of a world globe, turning: the far halves faint, behind the tickets.
        lines(ctx, cx, cy, R, s.turn, false);

        // The lid, open, stands behind what falls in; shut, it is drawn over the opening below.
        const theta = Math.max(0, s.lid) * LID_OPEN;
        if (theta >= 0.8) lid(ctx, cx, cy, R, theta, metal);

        // The tickets.
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, R - 1, 0, Math.PI * 2);
        ctx.rect(cx - R * 0.2, cy - R * 1.6, R * 0.4, R * 0.7);
        ctx.clip();
        let mineAt: Ticket | null = null;
        for (const t of s.tickets) {
          if (t.mine) {
            mineAt = t;
            continue;
          }
          if (t.glint > 0) ticket(ctx, t, tw * (1 + 0.12 * t.glint), th * (1 + 0.12 * t.glint), "#fff0c8", BACKS[t.shade], tw * 0.8 * t.glint);
          else ticket(ctx, t, tw, th, SHADES[t.shade], BACKS[t.shade], 0);
        }
        if (mineAt) ticket(ctx, mineAt, tw * 1.12, th * 1.12, "#ffe7a6", "#d9ab52", tw * (0.75 + 0.25 * Math.sin(s.clock * 0.004)));
        ctx.restore();

        // The near halves of the lines, over the tickets.
        lines(ctx, cx, cy, R, s.turn, true);

        // The light on the glass: its rim, a window's reflection high on the left with a bright
        // sliver beside it, a softer one opposite, and the light gathered low in it.
        const rim = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
        rim.addColorStop(0, "rgba(255, 246, 222, 0.85)");
        rim.addColorStop(0.5, "rgba(242, 211, 142, 0.3)");
        rim.addColorStop(1, "rgba(214, 168, 78, 0.65)");
        ctx.strokeStyle = rim;
        ctx.lineWidth = Math.max(1.6, R * 0.012);
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.save();
        ctx.translate(cx - R * 0.42, cy - R * 0.48);
        ctx.rotate(-0.62);
        const spec = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.3);
        spec.addColorStop(0, "rgba(255, 255, 255, 0.5)");
        spec.addColorStop(1, "rgba(255, 255, 255, 0)");
        ctx.fillStyle = spec;
        ctx.beginPath();
        ctx.ellipse(0, 0, R * 0.3, R * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(255, 252, 240, 0.42)";
        ctx.lineWidth = Math.max(1.5, R * 0.014);
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.93, Math.PI * 1.08, Math.PI * 1.3);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
        ctx.lineWidth = Math.max(2, R * 0.025);
        ctx.beginPath();
        ctx.arc(cx, cy, R * 0.86, -0.15, 0.75);
        ctx.stroke();
        ctx.lineCap = "butt";
        ctx.save();
        ctx.translate(cx, cy + R * 0.8);
        ctx.scale(1, 0.22);
        const caustic = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.45);
        caustic.addColorStop(0, `rgba(255, 232, 170, ${0.2 + 0.15 * s.flash})`);
        caustic.addColorStop(1, "rgba(255, 232, 170, 0)");
        ctx.fillStyle = caustic;
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // The opening at the top, where the tickets go in, and its ring of light as one does.
        if (s.flash > 0) {
          ctx.strokeStyle = `rgba(255, 236, 180, ${0.7 * s.flash})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy - R, R * (0.2 + (1 - s.flash) * 0.35), R * (0.05 + (1 - s.flash) * 0.09), 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(10, 8, 8, 0.92)";
        ctx.beginPath();
        ctx.ellipse(cx, cy - R + 1, R * 0.17, R * 0.045, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = metal;
        ctx.lineWidth = Math.max(2, R * 0.03);
        ctx.beginPath();
        ctx.ellipse(cx, cy - R + 1, R * 0.19, R * 0.055, 0, 0, Math.PI * 2);
        ctx.stroke();
        if (theta > 0.35) hinge(ctx, cx, cy, R, metal);
        if (theta < 0.8) lid(ctx, cx, cy, R, theta, metal);

        // "You", over the visitor's own.
        if (mineAt && !mineAt.entering) {
          const lx = mineAt.x;
          const ly = mineAt.y - th * 1.25;
          ctx.font = `800 ${Math.max(9, R * 0.065)}px system-ui, sans-serif`;
          const w = ctx.measureText("YOU").width + 10;
          const hh = Math.max(13, R * 0.09);
          ctx.fillStyle = "#d6a84e";
          ctx.beginPath();
          ctx.roundRect(lx - w / 2, ly - hh / 2, w, hh, hh / 2);
          ctx.fill();
          ctx.fillStyle = "#1b1307";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("YOU", lx, ly + 0.5);
        }
      };
      s.draw = draw;

      // Under reduced motion: everything at rest and the lid shut, drawn once (and again for each new ticket).
      if (still) {
        for (const isMine of s.queue.splice(0)) spawn(isMine, 0, true);
        for (let i = 0; i < 240; i++) step(1 / 120);
        draw();
        s.wake = () => {
          for (const isMine of s.queue.splice(0)) spawn(isMine, 0, true);
          for (let i = 0; i < 120; i++) step(1 / 120);
          draw();
        };
        const resize = new ResizeObserver(() => {
          fit();
          draw();
        });
        resize.observe(canvas.parentElement ?? canvas);
        return () => resize.disconnect();
      }

      let raf = 0;
      let last = 0;
      const frame = (now: number) => {
        raf = 0;
        if (!s.visible || document.visibilityState !== "visible") return;
        const dt = Math.min(1 / 30, last ? (now - last) / 1000 : 1 / 60);
        last = now;
        s.clock = now;
        // The lid springs open for what is coming, and shuts a moment after the last, with a bounce;
        // after the first pour it waits open for the visitor's own, flying in from the pass.
        const want = s.queue.length > 0 || now < s.lidUntil || (holdMine && !s.mineIn) ? 1 : 0;
        s.lidV += ((want - s.lid) * 60 - s.lidV * 9) * dt;
        s.lid += s.lidV * dt;
        if (s.lid < 0) {
          s.lid = 0;
          s.lidV = -s.lidV * 0.3;
        }
        // The pour: one at a time through the open lid, faster the more there are. The last of a
        // pour is mixed in by the air, unless the visitor's own is still to come.
        const every = Math.max(28, Math.min(110, 1600 / Math.max(1, s.queue.length + s.tickets.length)));
        if (s.queue.length && s.lid > 0.8 && now - s.lastPour > every) {
          s.lastPour = now;
          const isMine = s.queue.shift() as boolean;
          spawn(isMine, now);
          if (!s.queue.length && (s.mineIn || !holdMine)) s.gustAt = { at: now + 1000, power: isMine ? 1.15 : 0.85 };
        }
        if (s.gustAt && now >= s.gustAt.at) {
          s.blow(s.gustAt.power);
          s.gustAt = null;
        }
        if (!s.gust && !s.gustAt && !s.queue.length && now > s.nextGust) s.blow(IDLE_GUST.power);
        if (s.gust) {
          s.gust.t += dt;
          const e = s.gust.t / GUST_S;
          if (e >= 1) {
            s.gust = null;
            s.air = 0;
            s.nextGust = now + IDLE_GUST.from + Math.random() * IDLE_GUST.spread;
          } else s.air = Math.sin(Math.PI * e) * s.gust.power;
        }
        s.boost = Math.max(0, s.boost - dt * 0.8);
        s.flash = Math.max(0, s.flash - dt * 1.8);
        for (const t of s.tickets) if (t.glint > 0) t.glint = Math.max(0, t.glint - dt * 0.6);
        const target = s.spinTarget + s.boost;
        s.spin += (target - s.spin) * Math.min(1, dt * 3);
        s.turn += s.spin * dt * 0.45;
        step(dt / 2);
        step(dt / 2);
        draw();
        raf = requestAnimationFrame(frame);
      };
      const run = () => {
        if (raf || !s.visible || document.visibilityState !== "visible") return;
        last = 0;
        raf = requestAnimationFrame(frame);
      };
      s.wake = run;

      const seen = new IntersectionObserver((entries) => {
        s.visible = entries.some((e) => e.isIntersecting);
        if (s.visible) run();
      });
      seen.observe(canvas);
      const onShow = () => run();
      document.addEventListener("visibilitychange", onShow);
      const resize = new ResizeObserver(() => {
        fit();
        draw();
      });
      resize.observe(canvas.parentElement ?? canvas);
      draw();
      return () => {
        seen.disconnect();
        resize.disconnect();
        document.removeEventListener("visibilitychange", onShow);
        if (raf) cancelAnimationFrame(raf);
        sim.current = null;
      };
      // Built once per globe: later tickets come through drop().
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // A pointer on it turns it faster; a press sends the air through it.
    const faster = (on: boolean) => {
      const s = sim.current;
      if (!s) return;
      s.spinTarget = on ? 1.3 : 0.45;
      s.wake();
    };
    const stir = () => {
      const s = sim.current;
      if (!s || reduced()) return;
      s.boost = 1.6;
      s.blow(1.3);
    };

    return (
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        title={shakeLabel}
        onPointerEnter={(e) => e.pointerType === "mouse" && faster(true)}
        onPointerLeave={() => faster(false)}
        onClick={stir}
        className="tr-globe-canvas"
      />
    );
  },
);

/** Where the globe sits on its square: in the middle, room above it for the lid standing open, the stand under it. */
function geometry(S: number) {
  return { cx: S / 2, cy: S * 0.5, R: S * 0.33 };
}

/**
 * The lid over the opening, hinged at its back, open by `theta` (0 shut). The
 * opening is seen from a little above (its ellipse is 0.29 as tall as it is
 * wide): the lid's middle swings up and back over the hinge, and it is seen
 * edge on, then from beneath, as it opens.
 */
function lid(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, theta: number, metal: CanvasGradient) {
  const a = R * 0.2;
  const oy = cy - R + 1;
  const se = 0.29;
  const ce = 0.957;
  const up = a * (ce * Math.sin(theta) + se * (1 - Math.cos(theta)));
  const face = se * Math.cos(theta) - ce * Math.sin(theta);
  const ry = Math.max(0.8, a * Math.abs(face));
  ctx.save();
  ctx.fillStyle = face >= 0 ? metal : "#9a7230";
  ctx.beginPath();
  ctx.ellipse(cx, oy - up, a, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 240, 200, 0.6)";
  ctx.lineWidth = Math.max(1, R * 0.01);
  ctx.stroke();
  ctx.fillStyle = face >= 0 ? "rgba(255, 246, 220, 0.35)" : "rgba(60, 40, 10, 0.35)";
  ctx.beginPath();
  ctx.ellipse(cx, oy - up, a * 0.45, ry * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The lid's hinge, on the back of the opening's ring, where the lid stands from once it lifts. */
function hinge(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, metal: CanvasGradient) {
  const a = R * 0.2;
  const w = a * 0.56;
  const h = Math.max(2.5, R * 0.032);
  ctx.fillStyle = metal;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - R + 1 - a * 0.29 - h / 2, w, h, h / 2);
  ctx.fill();
}

/** The globe's gold lines, meridians and parallels on a tilted axis turning by `turn`; the near or the far halves. */
function lines(ctx: CanvasRenderingContext2D, cx: number, cy: number, R: number, turn: number, near: boolean) {
  const tilt = 0.38;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  ctx.strokeStyle = near ? "rgba(242, 211, 142, 0.5)" : "rgba(214, 168, 78, 0.16)";
  ctx.lineWidth = near ? 1.1 : 0.9;
  const curve = (pt: (u: number) => [number, number, number]) => {
    let drawing = false;
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const [x, y, z] = pt((i / 64) * Math.PI * 2);
      // Tilt the axis towards the viewer.
      const y2 = y * ct - z * st;
      const z2 = y * st + z * ct;
      const show = near ? z2 >= 0 : z2 < 0;
      if (show) {
        if (!drawing) ctx.moveTo(cx + x, cy + y2);
        else ctx.lineTo(cx + x, cy + y2);
        drawing = true;
      } else drawing = false;
    }
    ctx.stroke();
  };
  for (let k = 0; k < 4; k++) {
    const lon = turn + (k * Math.PI) / 4;
    curve((u) => [R * Math.cos(u) * Math.sin(lon), -R * Math.sin(u), R * Math.cos(u) * Math.cos(lon)]);
  }
  for (const lat of [-0.55, 0, 0.55]) {
    const rr = R * Math.cos(lat);
    const yy = -R * Math.sin(lat);
    curve((u) => [rr * Math.sin(u + turn), yy, rr * Math.cos(u + turn)]);
  }
}

/**
 * One golden ticket, turned over by `t.f` (squashed as it turns, its back a
 * shade darker): notched at the ends, a perforation near one end, a
 * highlight along its top; `glow`, lit from within (the visitor's, or one
 * catching the light).
 */
function ticket(ctx: CanvasRenderingContext2D, t: Ticket, tw: number, th: number, fill: string, back: string, glow: number) {
  const c = Math.cos(t.f);
  const front = c >= 0;
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate(t.a);
  ctx.scale(1, Math.max(0.14, Math.abs(c)));
  if (glow > 0) {
    ctx.shadowColor = "rgba(255, 220, 140, 0.95)";
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = front ? fill : back;
  ctx.beginPath();
  ctx.roundRect(-tw / 2, -th / 2, tw, th, th * 0.22);
  ctx.fill();
  ctx.shadowBlur = 0;
  // The notches either end, and the perforation.
  ctx.fillStyle = "rgba(20, 14, 10, 0.85)";
  ctx.beginPath();
  ctx.arc(-tw / 2, 0, th * 0.2, 0, Math.PI * 2);
  ctx.arc(tw / 2, 0, th * 0.2, 0, Math.PI * 2);
  ctx.fill();
  if (front) {
    ctx.strokeStyle = "rgba(110, 76, 22, 0.55)";
    ctx.lineWidth = Math.max(0.6, tw * 0.03);
    ctx.setLineDash([th * 0.12, th * 0.12]);
    ctx.beginPath();
    ctx.moveTo(tw * 0.22, -th / 2 + 1);
    ctx.lineTo(tw * 0.22, th / 2 - 1);
    ctx.stroke();
    ctx.setLineDash([]);
    // A highlight along the top edge.
    ctx.strokeStyle = "rgba(255, 250, 230, 0.55)";
    ctx.beginPath();
    ctx.moveTo(-tw / 2 + th * 0.3, -th / 2 + 1);
    ctx.lineTo(tw / 2 - th * 0.3, -th / 2 + 1);
    ctx.stroke();
  }
  ctx.restore();
}
