import gsap from "gsap";

/**
 * The way out to the application, from any "Apply for the Trip": the trip
 * takes off from the button that was pressed.
 *
 *   0.00  the button gives; its porthole's plane is ready (as on hover)
 *   0.08  the plane lifts off along a climbing curve to beyond the top right
 *         corner: accelerating, turning with the curve, growing as it nears
 *         the camera; a gold contrail draws itself behind it and sparks
 *         shed from it
 *   0.15  the page behind it dims
 *   0.70  where it leaves the screen, light blooms and fills the frame
 *   1.20  the application opens, out of the same light (ApplyExperience
 *         reads ARRIVAL_KEY and starts from this frame, so the two pages are
 *         one shot)
 *
 * Transform, opacity and a stroke's dash only. The layer is TakeOffLayer.
 * Under reduced motion the page simply fades to black and no light is
 * carried over.
 */
export const ARRIVAL_KEY = "cx-arrive";

export function takeOff(btn: HTMLElement, layer: HTMLElement, reduced: boolean, done: () => void) {
  const q = <T extends Element = HTMLElement>(key: string) => layer.querySelector<T>(`[data-cx='${key}']`);
  // Shown now, not on the timeline's first tick: the flight is measured from
  // it below (hidden, it measured 0 wide, and the plane flew to the top left).
  gsap.set(layer, { display: "block" });
  const tl = gsap.timeline({ onComplete: done });
  if (reduced) {
    tl.fromTo(q("exit-black"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 });
    return tl;
  }

  // The flight: from the porthole, a climbing curve to beyond the top right.
  const box = layer.getBoundingClientRect();
  const port = (btn.querySelector(".cx-apply-port") ?? btn).getBoundingClientRect();
  const x0 = port.left + port.width / 2 - box.left;
  const y0 = port.top + port.height / 2 - box.top;
  const x3 = box.width + 90;
  const y3 = -70;
  const f1 = (v: number) => v.toFixed(1);
  const d = `M${f1(x0)} ${f1(y0)} C${f1(x0 + (x3 - x0) * 0.38)} ${f1(y0 - Math.min(80, (y0 - y3) * 0.12))} ${f1(x0 + (x3 - x0) * 0.72)} ${f1(y3 + (y0 - y3) * 0.3)} ${f1(x3)} ${f1(y3)}`;
  const core = q<SVGPathElement>("exit-path");
  const glow = q<SVGPathElement>("exit-glow");
  const plane = q("exit-plane");
  if (!core || !glow || !plane) {
    tl.fromTo(q("exit-black"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 });
    return tl;
  }
  core.setAttribute("d", d);
  glow.setAttribute("d", d);
  const len = core.getTotalLength();
  for (const p of [core, glow]) {
    p.style.strokeDasharray = `${f1(len)} ${f1(len + 4)}`;
    p.style.strokeDashoffset = f1(len);
  }
  const sparks = Array.from(layer.querySelectorAll<HTMLElement>("[data-cx='exit-spark']"));
  const flight = { p: 0 };
  const place = () => {
    const s = flight.p * len;
    const pt = core.getPointAtLength(s);
    const ahead = core.getPointAtLength(Math.min(len, s + 2));
    const back = core.getPointAtLength(Math.max(0, s - 2));
    // The glyph's nose points up-right (-45°); turn it onto the curve.
    const turn = (Math.atan2(ahead.y - back.y, ahead.x - back.x) * 180) / Math.PI + 45;
    plane.style.transform = `translate(${f1(pt.x)}px, ${f1(pt.y)}px) rotate(${f1(turn)}deg) scale(${(1 + flight.p * 1.6).toFixed(3)})`;
    core.style.strokeDashoffset = f1(len - s);
    glow.style.strokeDashoffset = f1(len - s);
    sparks.forEach((sp, i) => {
      const at = s - (28 + i * 24);
      if (at <= 0) {
        sp.style.opacity = "0";
        return;
      }
      const sp0 = core.getPointAtLength(at);
      const scatter = Math.sin((i + 1) * 12.9898) * 11;
      sp.style.transform = `translate(${f1(sp0.x + scatter)}px, ${f1(sp0.y - scatter * 0.6)}px)`;
      sp.style.opacity = ((1 - i / sparks.length) * Math.min(1, at / 40)).toFixed(3);
    });
  };

  // The button gives, and its plane leaves the porthole for the sky.
  btn.classList.add("cx-apply-launch");
  tl.to(btn, { scale: 0.95, duration: 0.12, ease: "power2.out" }, 0);
  tl.to(btn, { scale: 1, duration: 0.35, ease: "power2.out" }, 0.12);
  tl.set(plane, { autoAlpha: 1 }, 0.08);
  tl.fromTo(flight, { p: 0 }, { p: 1, duration: 0.9, ease: "power2.in", onUpdate: place, immediateRender: false }, 0.08);
  tl.fromTo(q("exit-dim"), { autoAlpha: 0 }, { autoAlpha: 0.55, duration: 0.75, ease: "power1.in" }, 0.15);
  // Where it leaves, the light blooms and fills the frame.
  tl.fromTo(q("exit-bloom"), { autoAlpha: 0, scale: 0.04 }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: "power2.in" }, 0.7);
  return tl;
}
