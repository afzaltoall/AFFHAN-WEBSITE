/**
 * The jump from Guangzhou to Foshan: gold streaks pouring out of a vanishing
 * point, as if the camera went to light speed between the two cities.
 *
 * Drawn as a pure function of the jump's progress (0..1), with nothing kept
 * between frames, so the scrubbed film timeline can play it forwards and
 * back and every scroll position always shows the same picture. It draws
 * only when the timeline asks (no loop of its own).
 *
 *   speed    rises and falls: sin²(πp), 0 → 1 → 0
 *   travel   how far the streaks have come: the integral of speed, 0 → 1
 *   streaks  each on its own ray, slow and dim near the centre (perspective:
 *            radius ∝ u²) and long and bright at the edges, longer the faster
 *   flare    the vanishing point flares at p ≈ 0.72, as Foshan comes out of it
 */

type Streak = { cos: number; sin: number; r0: number; width: number; pale: boolean };

/** The jump's travel for a progress: slow, fast, slow (used by the readout too). */
export const warpTravel = (p: number) => p - Math.sin(2 * Math.PI * p) / (2 * Math.PI);

export class WarpField {
  private ctx: CanvasRenderingContext2D | null;
  private streaks: Streak[] = [];
  private w = 0;
  private h = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    count: number,
  ) {
    this.ctx = canvas.getContext("2d");
    // Seeded, so the same streaks every time.
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      this.streaks.push({ cos: Math.cos(a), sin: Math.sin(a), r0: rnd(), width: 0.8 + rnd() * 1.6, pale: rnd() < 0.25 });
    }
  }

  /** Size the canvas to its box (on build and on every ScrollTrigger refresh). */
  layout() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(p: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const { w, h } = this;
    ctx.clearRect(0, 0, w, h);
    if (p <= 0 || p >= 1) return;

    const cx = w / 2;
    const cy = h * 0.47;
    const R = Math.hypot(w, h) * 0.56;
    const speed = Math.sin(Math.PI * p) ** 2;
    const travel = warpTravel(p);
    // In over the first tenth, out over the last seventh.
    const envelope = Math.min(1, p / 0.1) * Math.min(1, (1 - p) / 0.14);

    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (const s of this.streaks) {
      const u = (s.r0 + travel * 2.4) % 1;
      const r = R * u * u;
      const len = 6 + R * 0.5 * speed * u;
      const a = envelope * (0.2 + 0.8 * u) * (0.45 + 0.55 * speed);
      if (a < 0.01) continue;
      ctx.strokeStyle = s.pale ? `rgba(255,244,214,${a.toFixed(3)})` : `rgba(242,211,142,${(a * 0.9).toFixed(3)})`;
      ctx.lineWidth = s.width * (0.4 + 1.2 * u);
      ctx.beginPath();
      ctx.moveTo(cx + s.cos * r, cy + s.sin * r);
      ctx.lineTo(cx + s.cos * (r + len), cy + s.sin * (r + len));
      ctx.stroke();
    }

    // The frame warms with the speed...
    const wash = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    wash.addColorStop(0, `rgba(242,211,142,${(0.16 * speed * envelope).toFixed(3)})`);
    wash.addColorStop(1, "rgba(214,168,78,0)");
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
    // ...and the vanishing point burns, flaring as Foshan comes out of it.
    const flare = Math.exp(-((p - 0.72) ** 2) / 0.012);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.38);
    glow.addColorStop(0, `rgba(255,244,214,${Math.min(1, 0.55 * speed + 0.6 * flare).toFixed(3)})`);
    glow.addColorStop(0.35, `rgba(242,211,142,${(0.2 * speed + 0.28 * flare).toFixed(3)})`);
    glow.addColorStop(1, "rgba(214,168,78,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
  }

  clear() {
    this.ctx?.clearRect(0, 0, this.w, this.h);
  }
}
