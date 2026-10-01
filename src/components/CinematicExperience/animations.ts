import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { GatherField } from "./particles";
import { ROUTE_POINTS } from "./Scene05Globe";
import { ANCHORS } from "./assets";
import { warpTravel } from "./warp";
import { SplitText } from "gsap/SplitText";
import { hold, textIn, type TextFx } from "./textfx";

/**
 * Every timeline on /free-china-trip/, and nothing else.
 *
 * SCROLL IS THE CAMERA. The page's scroll-driven timelines, in page order:
 *
 *   1. THE FILM (buildFilm*): one pinned stage, one scrubbed timeline, chapters
 *      01–11, from the traveller to What's included. One timeline so that the
 *      silk and the gold, and every hand-off (plane -> globe -> map -> the
 *      cities), is continuous; there is no seam between sections to hide.
 *   2. HOW IT WORKS (buildSteps): a short pinned stage: a comet flies the
 *      route through the three steps and each one is written as it lands.
 *   3. THE FINAL CALL TO ACTION (buildCta): the last pinned stage: the host
 *      and the call, then into time, then the countdown (14–16).
 *
 * PINNING is CSS position: sticky, not ScrollTrigger's pin. The stage is a
 * sticky child of a tall section whose height is the length of the scroll:
 * the page has its real height as soon as this code runs, with no pin-spacer
 * inserted into React's DOM, and Lenis and sticky agree about where
 * everything is. ScrollTrigger only reads progress (start "top top", end
 * "bottom bottom") and scrubs the timeline.
 *
 * TIME IS DISTANCE. One unit of timeline time is BEAT svh of scrolling, so the
 * numbers below are positions along the scroll, not seconds. Every position
 * is written out (no relative "<" / "+=" chains), so any beat can be found and
 * retimed on its own.
 *
 * ONLY transform, opacity (autoAlpha) and filter are animated. Nothing here
 * touches width, height, top or left.
 *
 * Elements are found by data-cx="…" keys. The scene files own the markup and
 * content.ts owns the words; neither needs to change when the timing does.
 */

/** Scroll distance per unit of timeline time, in svh. */
export const BEAT = 78;
/** The reduced-motion versions are shorter: nothing is travelling, so there is less to scroll through. */
export const BEAT_REDUCED = 62;

/** Where each film chapter starts, in timeline units; the chapter readout uses it.
 *  Chapter 07 is Guangzhou alone since October (it was three cities, 8.5 to
 *  12.0); everything after it moved 1.5 earlier. In the reduced film the
 *  cities took 2.7 and Guangzhou takes 1.0, so everything after moved 1.7. */
export const FILM_CHAPTER_STARTS = [0, 0.55, 1.95, 3.1, 4.5, 6.5, 8.5, 10.5, 13.0, 15.35, 18.0];
export const FILM_END = 20.7;
export const FILM_REDUCED_STARTS = [0, 0.85, 1.95, 2.95, 3.95, 4.95, 5.95, 6.95, 7.85, 8.75, 9.75];
const FILM_REDUCED_END = 10.6;

type Target = HTMLElement | SVGElement;

/** All elements for a data-cx key, inside root. */
function picker(root: ParentNode) {
  return (...keys: string[]): Target[] =>
    keys.flatMap((k) => Array.from(root.querySelectorAll<HTMLElement | SVGElement>(`[data-cx="${k}"]`)));
}

/** A pinned section is as tall as its scroll plus one screen for the sticky stage. */
function sizePinned(section: HTMLElement, units: number, beat: number) {
  section.style.height = `calc(${(units * beat).toFixed(1)}svh + 100svh)`;
}

function pinnedTimeline(section: HTMLElement, end: number, scrub: number | boolean, extra: ScrollTrigger.Vars = {}) {
  const tl = gsap.timeline({
    defaults: { ease: "none", immediateRender: false },
    scrollTrigger: {
      trigger: section,
      start: "top top",
      end: "bottom bottom",
      scrub,
      invalidateOnRefresh: true,
      ...extra,
    },
  });
  // Pad to the exact length, so timeline units map linearly onto the scroll.
  tl.set({}, {}, end);
  return tl;
}

export interface FilmHooks {
  /** time: timeline units; progress: 0..1. Called on every scroll update. */
  onProgress: (time: number, progress: number) => void;
  /** The night sky's dimmer (Starfield.tsx): lowered under the jump and the FREE reveal. */
  starsDim?: HTMLElement | null;
  /** Draws the jump to Foshan (warp.ts) for its progress, 0..1. */
  warp?: (p: number) => void;
  /** A landscape phone or any screen under 540px tall: the FREE lockup has to
   *  get smaller and higher to leave the included rows their room. */
  squat?: boolean;
}

/* =============================================================================
 * 1. THE FILM — pinned stage, chapters 01–11 (motion)
 * ============================================================================= */
export function buildFilm(film: HTMLElement, stage: HTMLElement, desktop: boolean, particles: GatherField | null, hooks: FilmHooks) {
  const $ = picker(stage);
  const d = desktop;
  /** An x offset in vw: desktop value, phone value. */
  const X = (desk: number, phone: number) => `${d ? desk : phone}vw`;
  const vh = (n: number) => `${n}vh`;

  sizePinned(film, FILM_END, BEAT);

  // Resting states the tweens below start from.
  gsap.set($("hero-img", "hero-copy", "hero-glow", "hero-silk"), { filter: "blur(0px)" });
  gsap.set($("city-guangzhou", "city-foshan"), { filter: "blur(0px) brightness(1)" });
  gsap.set($("globe-art"), { filter: "brightness(1) saturate(1)" });
  gsap.set($("boarding", "map"), { transformPerspective: 1400 });
  gsap.set($("route-head"), { x: ROUTE_POINTS[0].x, y: ROUTE_POINTS[0].y });
  gsap.set($("free-blur", "free-word", "free-glow", "free-sub-char"), { autoAlpha: 0 });
  gsap.set($("free-sweep"), { xPercent: -100 });
  gsap.set($("free-sweep-inner"), { xPercent: 24 });

  // THE FILM'S ScrollTrigger: the stage is sticky inside `film`; this reads
  // how far through `film` the page is and scrubs every chapter below.
  const tl = pinnedTimeline(film, FILM_END, 0.6, { onUpdate: (self) => hooks.onProgress(self.progress * FILM_END, self.progress) });

  /**
   * A chapter's caption. Named effects (textfx.ts) give each its own entrance,
   * like the lines of a title sequence: {part: effect}, parts being the
   * data-cx-part names inside it. Without them it fades up out of a blur.
   */
  const caption = (key: string, inAt: number, outAt: number, fx?: Record<string, TextFx | "fade">) => {
    const [box] = $(key);
    if (!fx || !box) {
      tl.fromTo($(key), { autoAlpha: 0, y: 26, filter: "blur(8px)" }, { autoAlpha: 1, y: 0, filter: "blur(0px)", ease: "power2.out", duration: 0.32 }, inAt);
    } else {
      tl.fromTo(box, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.06 }, inAt);
      const span = Math.min(0.6, (outAt - inAt) * 0.62);
      Object.entries(fx).forEach(([part, effect], i) => {
        const el = box.querySelector(`[data-cx-part="${part}"]`);
        const at = inAt + i * 0.08;
        // Every part holds its first frame from the start (immediateRender), so
        // nothing shows whole before its own entrance and then plays in again.
        if (effect === "fade") tl.fromTo(el, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, ease: "power2.out", duration: 0.3, immediateRender: true }, at);
        else textIn(tl, el, effect, at, part === "eyebrow" || part === "coords" ? Math.min(0.4, span) : span);
      });
    }
    tl.to($(key), { autoAlpha: 0, y: -18, filter: "blur(6px)", ease: "power1.in", duration: 0.25 }, outAt);
  };

  tl.fromTo($("hud"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0.8);

  // ---- 01 OPENING: the camera pushes past the traveller ---------------------
  tl.to($("hero-copy"), { autoAlpha: 0, y: -46, filter: "blur(10px)", ease: "power2.in", duration: 0.5 }, 0.12);
  tl.to($("hero-img"), { scale: 1.34, x: X(-7, -4), y: vh(3), ease: "power1.in", duration: 1.05 }, 0);
  tl.to($("hero-img"), { autoAlpha: 0, filter: "blur(12px)", ease: "power1.in", duration: 0.42 }, 0.66);
  tl.to($("hero-glow"), { scale: 1.5, autoAlpha: 0, ease: "power1.in", duration: 0.9 }, 0.15);
  // Foreground silk moves faster than the traveller: parallax.
  tl.to($("hero-silk"), { x: X(40, 64), y: vh(-6), rotation: 8, autoAlpha: 0, ease: "power1.in", duration: 0.9 }, 0.05);
  tl.to($("haze-warm"), { autoAlpha: 0, duration: 0.6 }, 0.7);
  tl.fromTo($("haze-crimson"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 0.6);

  // ---- 02 PASSPORT: grows towards the camera, then passes it -----------------
  tl.fromTo($("passport"), { autoAlpha: 0, scale: 0.48, x: X(4, 0), y: vh(7), filter: "blur(16px)" },
    { autoAlpha: 1, scale: 0.92, x: 0, y: 0, filter: "blur(0px)", ease: "power2.out", duration: 0.95 }, 0.55);
  tl.to($("passport"), { scale: 1.02, duration: 0.55 }, 1.5);
  tl.to($("passport"), { scale: 1.75, x: X(-18, -12), y: vh(10), autoAlpha: 0, filter: "blur(14px)", ease: "power2.in", duration: 0.7 }, 2.05);
  // Gold light behind it, drifting.
  tl.fromTo($("gold-back"), { autoAlpha: 0, x: X(20, 30), y: vh(-4), rotation: -6, scale: 0.9 },
    { autoAlpha: 0.55, x: X(-6, -10), y: vh(2), rotation: -2, scale: 1, duration: 1.4 }, 0.7);
  tl.to($("gold-back"), { autoAlpha: 0, duration: 0.35 }, 2.1);
  // Silk crossing the frame in front.
  tl.fromTo($("silk-front"), { autoAlpha: 0, x: X(95, 120), y: vh(-30), rotation: 10, scale: 0.9 },
    { autoAlpha: 0.6, x: X(-5, -10), y: vh(-30), rotation: -4, scale: 0.85, ease: "power1.inOut", duration: 0.9 }, 1.0);
  tl.to($("silk-front"), { x: X(-110, -150), y: vh(-34), rotation: -10, autoAlpha: 0, ease: "power1.in", duration: 0.55 }, 1.9);
  caption("cap-passport", 1.15, 2.0, { eyebrow: "words", title: "rise" });

  // ---- 03 BOARDING PASS: small behind the passport, then the hero ------------
  tl.fromTo($("boarding"), { autoAlpha: 0, scale: 0.34, x: X(24, 22), y: vh(-20), rotation: 9, rotationY: -26, filter: "blur(10px)" },
    { autoAlpha: 0.75, scale: 0.42, filter: "blur(6px)", ease: "power1.out", duration: 0.6 }, 1.15);
  tl.to($("boarding"), { autoAlpha: 1, scale: d ? 0.96 : 1.02, x: 0, y: 0, rotation: -2, rotationY: 0, rotationX: 8, filter: "blur(0px)", ease: "power2.inOut", duration: 0.95 }, 1.95);
  // Floating while held.
  tl.to($("boarding"), { y: vh(-2), rotationX: 0, rotation: -3.5, ease: "sine.inOut", duration: 0.75 }, 2.9);
  // The light sweep across the paper.
  tl.fromTo($("boarding-sweep"), { xPercent: -110 }, { xPercent: 110, ease: "power1.inOut", duration: 0.7 }, 2.55);
  tl.to($("boarding"), { autoAlpha: 0, scale: 0.72, x: X(30, 40), y: vh(-26), rotation: 7, filter: "blur(10px)", ease: "power2.in", duration: 0.6 }, 3.6);
  caption("cap-boarding", 2.6, 3.5, { eyebrow: "scramble", title: "scramble" });

  // ---- 04 AIRPLANE: enters from below left, becomes the hero, carries on ----
  tl.fromTo($("plane"), { autoAlpha: 0, scale: 0.36, x: X(-46, -60), y: vh(36), rotation: -5, filter: "blur(12px)" },
    { autoAlpha: 1, scale: d ? 0.6 : 0.78, x: X(-20, -18), y: vh(17), filter: "blur(3px)", ease: "power1.out", duration: 0.65 }, 3.1);
  tl.to($("plane"), { scale: d ? 1 : 1.18, x: X(3, 4), y: vh(-1), rotation: 0, filter: "blur(0px)", ease: "power2.out", duration: 0.8 }, 3.75);
  // The camera follows it.
  tl.to($("plane"), { x: X(10, 12), y: vh(-6), rotation: 2, scale: d ? 1.04 : 1.22, duration: 0.55 }, 4.55);
  // Past the globe and away.
  tl.to($("plane"), { x: X(64, 95), y: vh(-42), scale: d ? 0.46 : 0.6, rotation: 5, autoAlpha: 0, filter: "blur(6px)", ease: "power2.in", duration: 0.95 }, 5.1);
  // Motion blur follows speed.
  tl.fromTo($("plane-smear"), { autoAlpha: 0 }, { autoAlpha: 0.45, duration: 0.3 }, 3.15);
  tl.to($("plane-smear"), { autoAlpha: 0, duration: 0.35 }, 3.95);
  tl.to($("plane-smear"), { autoAlpha: 0.4, duration: 0.3 }, 5.1);
  tl.to($("plane-smear"), { autoAlpha: 0, duration: 0.3 }, 5.7);
  // The gold trail streams out behind it...
  tl.fromTo($("gold-back"), { autoAlpha: 0, x: X(-60, -80), y: vh(30), rotation: -18, scale: 0.8 },
    { autoAlpha: 0.85, x: X(-34, -44), y: vh(14), rotation: -14, scale: 0.95, ease: "power1.out", duration: 0.8 }, 3.3);
  tl.to($("gold-back"), { x: X(-26, -34), y: vh(8), rotation: -12, duration: 1.0 }, 4.1);
  caption("cap-plane", 3.9, 4.9, { eyebrow: "words", title: "rush" });
  tl.to($("haze-crimson"), { autoAlpha: 0, duration: 0.6 }, 4.4);
  tl.fromTo($("haze-deep"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 4.4);

  // ---- 05 GLOBE: one route, India to China -------------------------------------
  tl.fromTo($("globe"), { autoAlpha: 0, scale: 0.34, y: vh(9), rotation: -16, filter: "blur(14px)" },
    { autoAlpha: 1, scale: 0.86, y: 0, rotation: -5, filter: "blur(0px)", ease: "power2.out", duration: 1.1 }, 4.5);
  tl.to($("globe"), { rotation: 2, scale: 0.92, duration: 1.0 }, 5.6);
  tl.to($("globe-art"), { filter: "brightness(0.62) saturate(0.85)", duration: 0.3 }, 5.45);
  // ...and becomes the globe's orbit.
  tl.to($("gold-back"), { x: 0, y: vh(2), rotation: -10, scale: d ? 0.78 : 0.9, autoAlpha: 0.75, ease: "power2.inOut", duration: 0.9 }, 5.1);
  tl.to($("gold-back"), { rotation: -4, duration: 0.8 }, 6.0);
  tl.to($("gold-back"), { autoAlpha: 0, scale: 1.4, duration: 0.45 }, 6.5);
  // The route: India lights, the dots follow a travelling head, China lights.
  tl.fromTo($("route-end-a"), { opacity: 0 }, { opacity: 1, duration: 0.15 }, 5.55);
  tl.fromTo($("route-label-a"), { autoAlpha: 0, x: 8 }, { autoAlpha: 1, x: 0, duration: 0.25 }, 5.55);
  tl.fromTo($("route-head"), { opacity: 0 }, { opacity: 1, duration: 0.05 }, 5.6);
  tl.to($("route-head"), {
    keyframes: ROUTE_POINTS.map((p) => ({ x: p.x, y: p.y, ease: "none", duration: 0.6 / ROUTE_POINTS.length })),
  }, 5.6);
  tl.fromTo($("route-dot"), { opacity: 0 }, { opacity: 1, duration: 0.04, stagger: 0.6 / ROUTE_POINTS.length }, 5.6);
  tl.to($("route-head"), { opacity: 0, duration: 0.1 }, 6.2);
  tl.fromTo($("route-end-b"), { opacity: 0, scale: 0.4, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.2 }, 6.15);
  tl.fromTo($("route-label-b"), { autoAlpha: 0, x: -8 }, { autoAlpha: 1, x: 0, duration: 0.25 }, 6.15);
  caption("cap-globe", 5.3, 6.35, { eyebrow: "words", title: "flip" });
  // Push into China. Zooming about a point off-centre is scale plus the
  // translate that keeps the point still: -(s1 - s0) x its offset from centre
  // (China is 12% right of and 19% above the globe's centre).
  tl.to($("globe"), { scale: 3.3, xPercent: -(3.3 - 0.92) * 12, yPercent: (3.3 - 0.92) * 19, autoAlpha: 0, filter: "blur(12px)", ease: "power2.in", duration: 0.85 }, 6.45);

  // ---- 06 CHINA MAP: rises flat out of the push, silk wraps, gold follows ---
  tl.fromTo($("map"), { autoAlpha: 0, scale: 0.7, rotationX: 40, y: vh(12), filter: "blur(12px)" },
    { autoAlpha: 1, scale: 1, rotationX: 14, y: 0, filter: "blur(0px)", ease: "power3.out", duration: 1.05 }, 6.5);
  tl.to($("map"), { rotationX: 3, scale: 1.05, duration: 0.85 }, 7.55);
  tl.fromTo($("map-glow"), { autoAlpha: 0, scale: 0.55 }, { autoAlpha: 1, scale: 1, duration: 0.9 }, 6.5);
  tl.to($("map-glow"), { autoAlpha: 0, scale: 1.3, duration: 0.6 }, 8.2);
  tl.to($("haze-deep"), { autoAlpha: 0, duration: 0.6 }, 6.4);
  tl.to($("haze-crimson"), { autoAlpha: 1, duration: 0.6 }, 6.4);
  tl.fromTo($("silk-front"), { autoAlpha: 0, x: X(-120, -160), y: vh(30), rotation: -16, scale: 1.2 },
    { autoAlpha: 1, x: X(0, 0), y: vh(26), rotation: -4, scale: 1.15, ease: "power2.out", duration: 0.5 }, 6.15);
  tl.to($("silk-front"), { x: X(125, 170), y: vh(18), rotation: 10, autoAlpha: 0, ease: "power2.in", duration: 0.5 }, 6.65);
  tl.fromTo($("gold-front"), { autoAlpha: 0, x: X(-130, -170), y: vh(-30), rotation: 12, scale: 1 },
    { autoAlpha: 0.9, x: X(0, -10), y: vh(-26), rotation: 2, scale: 1, ease: "power2.out", duration: 0.55 }, 6.35);
  tl.to($("gold-front"), { x: X(130, 170), y: vh(-22), rotation: -8, autoAlpha: 0, ease: "power2.in", duration: 0.55 }, 6.9);
  caption("cap-map", 7.2, 8.2, { eyebrow: "words", title: "wipe" });
  // Dive into the Guangzhou marker, at the foot of the map's little Canton
  // Tower: the city rises out of it. Zooming about a point is scale plus the
  // translate that keeps the point still, -(s1 - s0) x its offset from the
  // centre, here across and down (ANCHORS, read off the artwork).
  const gz = { x: ANCHORS.mapGuangzhou.x - 0.5, y: ANCHORS.mapGuangzhou.y - 0.5 };
  tl.to($("map"), { scale: 3.6, xPercent: -(3.6 - 1.05) * gz.x * 100, yPercent: -(3.6 - 1.05) * gz.y * 100, autoAlpha: 0, filter: "blur(10px)", ease: "power2.in", duration: 0.8 }, 8.35);

  // ---- 07 GUANGZHOU: out of its marker, its lights come on, flown into ------
  // The first city, and since October the only one before Foshan (Shanghai and
  // Beijing came out on the owner's request). It rises from where its marker
  // was on the map (the map is 62vw / 118vw wide at 1.05, so the marker sits
  // ~5vw / ~9vw right of centre and ~10vw / ~18vw below it), still dark. As it
  // lands its lights come on, up past full and settling, while a gold trail
  // sweeps across the skyline and silk follows. The camera drifts in, then
  // flies straight into it: it becomes the jump's vanishing point, flaring as
  // Foshan will come out of the light.
  tl.fromTo($("city-guangzhou"), { autoAlpha: 0, scale: 0.22, x: X(5, 9), y: d ? "10vw" : "18vw", filter: "blur(14px) brightness(0.4)" },
    { autoAlpha: 1, scale: d ? 0.94 : 1, x: X(0, 0), y: 0, filter: "blur(0px) brightness(0.7)", ease: "power2.out", duration: 0.85 }, 8.5);
  tl.to($("city-guangzhou"), { filter: "blur(0px) brightness(1.22)", ease: "power2.out", duration: 0.35 }, 9.35);
  tl.to($("city-guangzhou"), { filter: "blur(0px) brightness(1)", ease: "power1.inOut", duration: 0.5 }, 9.7);
  tl.to($("city-guangzhou"), { scale: d ? 1.08 : 1.15, x: X(-3, -4), duration: 1.15 }, 9.35);
  tl.to($("city-guangzhou"), { scale: 3.4, x: X(0, 0), y: vh(4), autoAlpha: 0, filter: "blur(16px) brightness(1.6)", ease: "power2.in", duration: 0.6 }, 10.5);
  caption("cap-guangzhou", 9.0, 10.5, { hanzi: "fade", coords: "scramble", name: "track" });
  tl.fromTo($("gold-front"), { autoAlpha: 0, x: X(-120, -160), y: vh(6), rotation: 8, scale: 0.9 },
    { autoAlpha: 0.85, x: X(0, 0), y: vh(-2), rotation: 0, ease: "power1.out", duration: 0.4 }, 9.25);
  tl.to($("gold-front"), { autoAlpha: 0, x: X(120, 160), y: vh(-8), rotation: -8, ease: "power1.in", duration: 0.4 }, 9.65);
  tl.fromTo($("silk-back"), { autoAlpha: 0, x: X(90, 120), y: vh(-14), rotation: 12, scale: 0.8 },
    { autoAlpha: 0.8, x: X(0, 0), y: vh(-2), rotation: 3, ease: "power1.out", duration: 0.45 }, 9.55);
  tl.to($("silk-back"), { autoAlpha: 0, x: X(-90, -120), y: vh(10), rotation: -6, ease: "power1.in", duration: 0.45 }, 10.0);

  // ---- 07 → 08 THE JUMP TO YIWU: light speed, out of a vanishing point --------
  // Gold streaks pour out of the centre (warp.ts draws them from the jump's
  // progress, so scrolling back plays it backwards), the readout's
  // coordinates run from Guangzhou's to Foshan's, the sky dims so the light
  // owns the frame, and the centre flares as Foshan comes out of it.
  const jump = { p: 0 };
  const [warpLine] = $("warp-line");
  const [warpDot] = $("warp-dot");
  const [warpCoords] = $("warp-coords");
  const onJump = () => {
    hooks.warp?.(jump.p);
    const e = warpTravel(jump.p);
    if (warpLine) warpLine.style.transform = `scaleX(${e.toFixed(4)})`;
    if (warpDot) warpDot.style.left = `${(e * 100).toFixed(2)}%`;
    if (warpCoords) {
      const text = `${(23.13 - 0.11 * e).toFixed(2)}° N · ${(113.26 - 0.14 * e).toFixed(2)}° E`;
      if (warpCoords.textContent !== text) warpCoords.textContent = text;
    }
  };
  tl.fromTo($("warp"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12 }, 10.45);
  tl.fromTo(jump, { p: 0 }, { p: 1, ease: "none", duration: 1.2, onUpdate: onJump }, 10.5);
  tl.to($("warp"), { autoAlpha: 0, duration: 0.2 }, 11.6);
  tl.fromTo($("warp-readout"), { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.25 }, 10.6);
  tl.to($("warp-readout"), { autoAlpha: 0, y: -10, duration: 0.2 }, 11.45);
  if (hooks.starsDim) {
    tl.to(hooks.starsDim, { opacity: 0.6, duration: 0.3 }, 10.5);
    tl.to(hooks.starsDim, { opacity: 1, duration: 0.4 }, 11.6);
  }

  // ---- 08 FOSHAN: out of the light, and the camera gently approaches --------
  // The market comes out of the vanishing point and, on desktop, settles 7vh
  // above centre: it is 16:9 (Yiwu was 2:1), so centred its busiest edge, the
  // crowd and the sofas, sat right behind the caption. Lifted, the caption
  // rests on the picture's faded foot. A phone's picture ends above the
  // caption anyway.
  tl.fromTo($("city-foshan"), { autoAlpha: 0, scale: 0.06, x: 0, y: vh(-3), filter: "blur(20px) brightness(1.6)" },
    { autoAlpha: 1, scale: d ? 0.98 : 1.06, y: vh(d ? -7 : 0), filter: "blur(0px) brightness(1)", ease: "expo.out", duration: 1.0 }, 11.3);
  tl.to($("city-foshan"), { scale: d ? 1.1 : 1.18, y: vh(d ? -6 : 1), duration: 1.05 }, 12.3);
  caption("cap-foshan", 12, 13.1, { hanzi: "fade", coords: "scramble", name: "track", line: "type" });

  // ---- 09 HOTEL: darken, gold, silk, then the hotel ---------------------------------
  tl.fromTo($("veil"), { autoAlpha: 0 }, { autoAlpha: 0.6, duration: 0.6 }, 13.05);
  tl.to($("city-foshan"), { filter: "blur(6px) brightness(0.55)", duration: 0.6 }, 13.05);
  tl.fromTo($("gold-front"), { autoAlpha: 0, x: X(-110, -150), y: vh(10), rotation: 8, scale: 1 },
    { autoAlpha: 0.9, x: X(0, 0), y: vh(0), rotation: 0, ease: "power1.out", duration: 0.4 }, 13.25);
  tl.to($("gold-front"), { autoAlpha: 0, x: X(110, 150), y: vh(-10), rotation: -8, ease: "power1.in", duration: 0.4 }, 13.65);
  tl.fromTo($("silk-front"), { autoAlpha: 0, x: X(110, 150), y: vh(16), rotation: 12, scale: 1.2 },
    { autoAlpha: 1, x: X(0, 0), y: vh(4), rotation: 2, ease: "power1.out", duration: 0.4 }, 13.5);
  tl.to($("silk-front"), { autoAlpha: 0, x: X(-120, -160), y: vh(-10), rotation: -10, ease: "power1.in", duration: 0.4 }, 13.9);
  tl.to($("city-foshan"), { autoAlpha: 0, duration: 0.45 }, 13.75);
  tl.to($("veil"), { autoAlpha: 0.25, duration: 0.5 }, 13.8);
  tl.fromTo($("hotel"), { autoAlpha: 0, scale: 1.18, filter: "blur(12px)" },
    { autoAlpha: 1, scale: 1, filter: "blur(0px)", ease: "power2.out", duration: 0.85 }, 13.7);
  tl.to($("hotel"), { scale: 1.06, duration: 0.9 }, 14.55);
  tl.fromTo($("hotel-glow"), { autoAlpha: 0, scale: 0.7 }, { autoAlpha: 0.9, scale: 1, duration: 0.9 }, 13.9);
  tl.to($("haze-crimson"), { autoAlpha: 0, duration: 0.6 }, 13.6);
  tl.to($("haze-warm"), { autoAlpha: 1, duration: 0.6 }, 13.6);
  caption("cap-hotel", 14.15, 15.2, { eyebrow: "words", title: "words" });

  // ---- 10 FREE: everything goes dark; particles gather; the word resolves --
  tl.to($("hotel"), { autoAlpha: 0, scale: 1.14, filter: "blur(12px)", ease: "power2.in", duration: 0.6 }, 15.4);
  tl.to($("hotel-glow"), { autoAlpha: 0, duration: 0.5 }, 15.4);
  tl.to($("veil"), { autoAlpha: 0, duration: 0.4 }, 15.6);
  tl.to($("haze-warm"), { autoAlpha: 0, duration: 0.5 }, 15.4);
  // The sky dims too: FREE owns the frame.
  if (hooks.starsDim) {
    tl.to(hooks.starsDim, { opacity: 0.3, duration: 0.6 }, 15.4);
    tl.to(hooks.starsDim, { opacity: 1, duration: 0.6 }, 18);
  }
  // Silk and gold keep moving through the dark, framing the word.
  tl.fromTo($("silk-back"), { autoAlpha: 0, x: X(70, 90), y: vh(26), rotation: 8, scale: 1.1 },
    { autoAlpha: 0.42, x: X(8, 0), y: vh(30), rotation: 2, scale: 1.15, ease: "power1.out", duration: 1.0 }, 15.5);
  tl.to($("silk-back"), { x: X(-20, -30), y: vh(32), rotation: -3, duration: 1.5 }, 16.5);
  tl.fromTo($("gold-back"), { autoAlpha: 0, x: X(-70, -90), y: vh(-24), rotation: -8, scale: 1 },
    { autoAlpha: 0.45, x: X(-4, 0), y: vh(-30), rotation: -2, scale: 1.1, ease: "power1.out", duration: 1.0 }, 15.6);
  tl.to($("gold-back"), { x: X(16, 24), y: vh(-32), rotation: 3, duration: 1.4 }, 16.6);
  // Particles gather into the letterforms themselves (particles.ts samples
  // the page's own type: its face, size, spacing and baseline) and land.
  const dust = { gather: 0, fade: 0 };
  const draw = () => particles?.render(dust.gather, dust.fade);
  tl.fromTo($("free-particles"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.1 }, 15.7);
  tl.fromTo(dust, { gather: 0 }, { gather: 1, ease: "power1.inOut", duration: 0.95, onUpdate: draw }, 15.7);
  // The word forms under the landed dots, exactly in their place: the lockup
  // does not scale here (it did, and the letters then came in larger than
  // the shape the dots had made). Its light blooms first, then the type,
  // then the dots dissolve into it.
  tl.fromTo($("free-lockup"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.05 }, 16.25);
  tl.fromTo($("free-glow"), { autoAlpha: 0, scale: 0.85 }, { autoAlpha: 1, scale: 1, ease: "power2.out", duration: 0.7 }, 16.3);
  tl.fromTo($("free-blur"), { autoAlpha: 0 }, { autoAlpha: 0.85, duration: 0.3 }, 16.45);
  tl.fromTo($("free-word"), { autoAlpha: 0 }, { autoAlpha: 1, ease: "power1.inOut", duration: 0.4 }, 16.6);
  tl.fromTo(dust, { fade: 0 }, { fade: 1, ease: "power1.in", duration: 0.45 }, 16.7);
  tl.to($("free-blur"), { autoAlpha: 0, duration: 0.4 }, 16.8);
  tl.to($("free-particles"), { autoAlpha: 0, duration: 0.1 }, 17.12);
  // One sweep of light across the letters, once the dots have gone into them.
  tl.fromTo($("free-sweep"), { xPercent: -100 }, { xPercent: 416.667, ease: "power1.inOut", duration: 0.65 }, 17);
  tl.fromTo($("free-sweep-inner"), { xPercent: 24 }, { xPercent: -100, ease: "power1.inOut", duration: 0.65 }, 17);
  // CHINA BUSINESS TRIP, letter by letter.
  tl.fromTo($("free-sub-char"), { autoAlpha: 0, y: 14, filter: "blur(8px)" },
    { autoAlpha: 1, y: 0, filter: "blur(0px)", ease: "power2.out", duration: 0.3, stagger: 0.022 }, 17.05);

  // ---- 11 WHAT'S INCLUDED: the lockup rises; four rows arrive in turn ------
  const sq = !!hooks.squat;
  tl.to($("free-lockup"), { y: vh(sq ? -37 : d ? -31 : -30), scale: sq ? (d ? 0.26 : 0.3) : d ? 0.36 : 0.5, ease: "power3.inOut", duration: 0.75 }, 18);
  tl.to($("free-glow"), { autoAlpha: 0.4, duration: 0.6 }, 18);
  tl.to($("silk-back", "gold-back"), { autoAlpha: 0.22, duration: 0.6 }, 18);
  tl.fromTo($("inc-eyebrow"), { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.3 }, 18.55);
  $("inc-row").forEach((row, i) => {
    const at = 18.65 + i * 0.36;
    tl.fromTo(row.querySelector("[data-cx='inc-line']"), { scaleX: 0 }, { scaleX: 1, ease: "power2.inOut", duration: 0.55 }, at - 0.08);
    tl.fromTo(row, { autoAlpha: 0, y: 34, filter: "blur(8px)" }, { autoAlpha: 1, y: 0, filter: "blur(0px)", ease: "power2.out", duration: 0.42 }, at);
  });
  tl.to($("hud"), { autoAlpha: 0, duration: 0.3 }, FILM_END - 0.45);
  // The silk, the gold and the glow go before the stage scrolls away. The
  // stage clips what it holds, so they used to leave cut off by a hard
  // straight line along its foot as How it works came up beneath it.
  tl.to($("silk-back", "gold-back", "free-glow"), { autoAlpha: 0, duration: 0.4 }, FILM_END - 0.45);

  return tl;
}

/* =============================================================================
 * 1r. THE FILM, reduced motion — the same pinned stage, dissolves only
 * Nothing travels, scales, blurs or parallaxes: each chapter's frame fades in
 * at its resting composition and fades out for the next. All the words and
 * both calls to action are still there.
 * ============================================================================= */
export function buildFilmReduced(film: HTMLElement, stage: HTMLElement, desktop: boolean, hooks: FilmHooks) {
  const $ = picker(stage);
  const END = FILM_REDUCED_END;
  sizePinned(film, END, BEAT_REDUCED);

  // The route and the FREE lockup appear finished, not drawn.
  gsap.set($("route-dot", "route-end-a", "route-end-b"), { opacity: 1 });
  gsap.set($("route-head"), { opacity: 0 });
  gsap.set($("free-word", "free-glow", "free-sub-char"), { autoAlpha: 1 });
  gsap.set($("free-blur"), { autoAlpha: 0 });
  gsap.set($("inc-line"), { scaleX: 1 });
  // Foshan rests where the full film puts it, above its caption (desktop).
  if (desktop) gsap.set($("city-foshan"), { y: "-7vh" });

  // THE FILM'S ScrollTrigger, reduced: same stage, straight scrub.
  const tl = pinnedTimeline(film, END, true, { onUpdate: (self) => hooks.onProgress(self.progress * END, self.progress) });
  const fade = (keys: string[], inAt: number, outAt?: number) => {
    tl.fromTo($(...keys), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 }, inAt);
    if (outAt !== undefined) tl.to($(...keys), { autoAlpha: 0, duration: 0.25 }, outAt);
  };

  tl.fromTo($("hud"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, 0.7);
  tl.to($("hero-copy", "hero-img", "hero-glow", "hero-silk"), { autoAlpha: 0, duration: 0.25 }, 0.6);
  tl.to($("haze-warm"), { autoAlpha: 0, duration: 0.25 }, 0.6);
  tl.fromTo($("haze-crimson"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 }, 0.6);
  const s = FILM_REDUCED_STARTS;
  fade(["passport", "cap-passport"], s[1], s[2] - 0.3);
  fade(["boarding", "cap-boarding"], s[2], s[3] - 0.3);
  fade(["plane", "cap-plane"], s[3], s[4] - 0.3);
  fade(["globe", "cap-globe", "route-label-a", "route-label-b"], s[4], s[5] - 0.3);
  fade(["map", "map-glow", "cap-map"], s[5], s[6] - 0.3);
  fade(["city-guangzhou", "cap-guangzhou"], s[6], s[7] - 0.3);
  fade(["city-foshan", "cap-foshan"], s[7], s[8] - 0.3);
  fade(["hotel", "hotel-glow", "cap-hotel"], s[8], s[9] - 0.3);
  tl.to($("haze-crimson"), { autoAlpha: 0, duration: 0.25 }, s[9] - 0.3);
  fade(["free-lockup"], s[9], s[10] - 0.35);
  // Moved to its small position while invisible, so nothing is seen to move.
  const sq = !!hooks.squat;
  tl.set($("free-lockup"), { y: `${sq ? -37 : desktop ? -31 : -30}vh`, scale: sq ? (desktop ? 0.26 : 0.3) : desktop ? 0.36 : 0.5 }, s[10] - 0.05);
  fade(["free-lockup", "inc-eyebrow", "inc-row"], s[10]);
  tl.to($("hud"), { autoAlpha: 0, duration: 0.2 }, END - 0.3);
  return tl;
}

/**
 * A ring of light that swells and fades, as a pure function of the playhead,
 * so it plays the same both ways and is invisible before and after.
 */
function pulse(tl: gsap.core.Timeline, el: Element | null | undefined, at: number, dur: number, to: number) {
  if (!(el instanceof HTMLElement)) return;
  const s = { p: 0 };
  const draw = () => {
    const p = s.p;
    el.style.opacity = p <= 0 || p >= 1 ? "0" : (Math.min(1, p / 0.08) * (1 - p) * 0.9).toFixed(3);
    el.style.transform = `scale(${(1 + (to - 1) * (1 - (1 - p) * (1 - p))).toFixed(3)})`;
  };
  tl.fromTo(s, { p: 0 }, { p: 1, ease: "none", duration: dur, onUpdate: draw, immediateRender: false }, at);
}

/* =============================================================================
 * 2. HOW IT WORKS — the route: a short pinned stage (sticky)
 * The heading is written in; the planned route appears, dashed, through the
 * three stops; a comet flies it leg by leg, the route turning gold behind it;
 * each stop ignites as the comet reaches it and its words are written; at
 * China, light runs the whole route once. Not pinned when the stage does not
 * fit the screen (it plays as it passes); still under reduced motion.
 * ============================================================================= */
export const STEPS_END = 3.0;

export function buildSteps(section: HTMLElement, desktop: boolean, reduced: boolean, short: boolean): () => void {
  const $ = picker(section);
  const [content] = $("steps-content") as HTMLElement[];
  const [svg] = $("steps-svg");
  const [track] = $("steps-track");
  const [glint] = $("steps-glint");
  const [comet] = $("steps-comet") as HTMLElement[];
  const legs = $("steps-seg") as SVGPathElement[];
  const nodes = $("step-node");
  const steps = $("step");
  if (!content || !svg || !track || !glint || !comet || legs.length !== 3 || nodes.length !== 3 || steps.length !== 3) return () => undefined;

  // THE ROUTE'S SHAPE, from where the three stops really are: flight arcs
  // between them on a desktop, a gentle sway down the left on a phone.
  // Redrawn before every refresh (fonts, resizes), so it always meets them.
  const f1 = (v: number) => v.toFixed(1);
  let lens = [0, 0, 0];
  const layout = () => {
    const o = svg.getBoundingClientRect();
    const at = nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return { x: r.left + r.width / 2 - o.left, y: r.top + r.height / 2 - o.top };
    });
    // It sweeps in from the left, half a leg out (desktop), or drops in from
    // above the first stop (phone).
    const lead = desktop ? Math.max(96, (at[1].x - at[0].x) * 0.5) : 0;
    const from = desktop ? { x: at[0].x - lead, y: at[0].y + 46 } : { x: at[0].x, y: at[0].y - 26 };
    const pts = [from, ...at];
    const curves = at.map((b, i) => {
      const a = pts[i];
      if (desktop) {
        const dx = b.x - a.x;
        const lift = i === 0 ? 0 : -Math.min(44, dx * 0.1);
        return `C${f1(a.x + dx * 0.42)} ${f1(a.y + lift)} ${f1(b.x - dx * 0.42)} ${f1(b.y + lift)} ${f1(b.x)} ${f1(b.y)}`;
      }
      const dy = b.y - a.y;
      const sway = i === 0 ? 0 : -14;
      return `C${f1(a.x + sway)} ${f1(a.y + dy * 0.42)} ${f1(b.x + sway)} ${f1(b.y - dy * 0.42)} ${f1(b.x)} ${f1(b.y)}`;
    });
    legs.forEach((p, i) => p.setAttribute("d", `M${f1(pts[i].x)} ${f1(pts[i].y)} ${curves[i]}`));
    const whole = `M${f1(from.x)} ${f1(from.y)} ${curves.join(" ")}`;
    track.setAttribute("d", whole);
    glint.setAttribute("d", whole);
    lens = legs.map((p) => p.getTotalLength());
  };

  // THE COMET: one number, ride (0..3: which leg, and how far along it),
  // draws the legs behind it and places it, so line and light never part.
  const ride = { s: 0 };
  const draw = () => {
    legs.forEach((leg, k) => {
      const len = lens[k];
      const f = Math.max(0, Math.min(1, ride.s - k));
      leg.style.strokeDasharray = `${f1(len)} ${f1(len + 2)}`;
      leg.style.strokeDashoffset = f1((1 - f) * len);
    });
    const k = Math.min(2, Math.floor(ride.s));
    const leg = legs[k];
    const d = Math.max(0, Math.min(1, ride.s - k)) * lens[k];
    const p = leg.getPointAtLength(d);
    const back = leg.getPointAtLength(Math.max(0, d - 4));
    const ahead = leg.getPointAtLength(Math.min(lens[k], d + 4));
    const turn = Math.atan2(ahead.y - back.y, ahead.x - back.x);
    comet.style.transform = `translate(${f1(p.x)}px, ${f1(p.y)}px) rotate(${turn.toFixed(3)}rad)`;
  };
  const relayout = () => {
    layout();
    draw();
  };
  relayout();
  ScrollTrigger.addEventListener("refreshInit", relayout);

  const undo = () => {
    ScrollTrigger.removeEventListener("refreshInit", relayout);
    section.removeAttribute("data-flow");
    section.style.height = "";
    legs.forEach((p) => {
      p.style.strokeDasharray = "";
      p.style.strokeDashoffset = "";
    });
    comet.style.transform = "";
    section.querySelectorAll<HTMLElement>("[data-cx='step-ring'],[data-cx='step-ring2']").forEach((r) => {
      r.style.opacity = "";
      r.style.transform = "";
    });
  };

  // Pinned only if the stage fits between the navbar and the bottom of the screen.
  const pinned = !reduced && !short && content.offsetHeight <= window.innerHeight - 88;
  section.toggleAttribute("data-flow", !pinned);

  // THE WAY OUT ScrollTrigger: as How it works leaves (unpinned, rising off
  // the top of the screen) it dissolves: the words lift a little and soften,
  // and the stage's warm haze and dust go with them, so it never ends in a
  // hard line across the sky. The final call is arriving underneath
  // (buildCta). Pinned, it starts the moment the stage lets go; flowing, once
  // the last stop has been written. Under reduced motion it only fades.
  const leave = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: section,
      start: pinned ? "bottom bottom" : "bottom 55%",
      end: pinned ? "bottom 38%" : "bottom 15%",
      scrub: reduced ? true : 0.4,
      invalidateOnRefresh: true,
    },
  });
  leave.to($("steps-haze", "steps-dust"), { autoAlpha: 0, duration: 0.7 }, 0);
  if (reduced) leave.to(content, { autoAlpha: 0, duration: 1 }, 0);
  else leave.to(content, { autoAlpha: 0, y: () => -0.05 * window.innerHeight, filter: "blur(5px)", ease: "power1.in", duration: 1 }, 0);

  if (reduced) {
    // The route drawn, every stop lit, every word in place.
    ride.s = 3;
    draw();
    gsap.set($("step-core"), { scale: 1 });
    return undo;
  }

  // HOW IT WORKS ScrollTrigger: pinned, it starts as the stage comes up the
  // screen, so the heading is written while it rises; unpinned, it plays over
  // the section's passage.
  let tl: gsap.core.Timeline;
  if (pinned) {
    sizePinned(section, STEPS_END, BEAT);
    tl = pinnedTimeline(section, STEPS_END, 0.6, { start: "top 62%" });
  } else {
    tl = gsap.timeline({
      defaults: { ease: "none", immediateRender: false },
      scrollTrigger: { trigger: section, start: "top 72%", end: "bottom 55%", scrub: 0.6, invalidateOnRefresh: true },
    });
    tl.set({}, {}, STEPS_END);
  }

  // 0: the heading, typed and then drawn across like a route.
  textIn(tl, $("steps-eyebrow")[0], "type", 0, 0.28);
  textIn(tl, $("steps-title")[0], "wipe", 0.06, 0.5);
  // 0.3: the planned route, dashed, and its three stops.
  tl.fromTo(track, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, immediateRender: true }, 0.3);
  hold(tl, nodes, { autoAlpha: 0, scale: 0.2 }, { autoAlpha: 1, scale: 1, ease: "back.out(2.2)", duration: 0.18, stagger: 0.07 }, 0.34);
  // 0.56: the comet sets off; it rests at each stop while the stop is written.
  tl.fromTo(comet, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.05, immediateRender: true }, 0.56);
  const LEGS: Array<[number, number]> = [[0.56, 0.3], [1.22, 0.48], [2.0, 0.48]];
  LEGS.forEach(([at, dur], k) => tl.fromTo(ride, { s: k }, { s: k + 1, ease: "power1.inOut", duration: dur, onUpdate: draw }, at));
  const IGNITE = [0.86, 1.7, 2.48];
  steps.forEach((li, i) => {
    const at = IGNITE[i];
    const q = (key: string) => li.querySelector<HTMLElement>(`[data-cx='${key}']`);
    tl.fromTo(q("step-core"), { scale: 0 }, { scale: 1, ease: "back.out(3)", duration: 0.12, immediateRender: true }, at);
    pulse(tl, q("step-ring"), at, 0.42, 3.6);
    textIn(tl, q("step-num"), "rise", at + 0.02, 0.32);
    textIn(tl, q("step-title"), "type", at + 0.1, 0.26);
    textIn(tl, q("step-detail"), "words", at + 0.16, 0.3);
    const tag = q("step-tag");
    if (tag) tl.fromTo(tag, { autoAlpha: 0, x: -6 }, { autoAlpha: 1, x: 0, duration: 0.12, immediateRender: true }, at + 0.34);
  });
  // 2.48: China. The comet becomes the stop; a wider ring; light runs the route.
  tl.fromTo(comet, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.08 }, IGNITE[2]);
  pulse(tl, steps[2].querySelector("[data-cx='step-ring2']"), IGNITE[2] + 0.04, 0.6, 6);
  tl.fromTo(glint, { opacity: 0 }, { opacity: 1, duration: 0.04, immediateRender: true }, 2.56);
  tl.fromTo(glint, { strokeDashoffset: 0.07 }, { strokeDashoffset: -1, ease: "power1.inOut", duration: 0.34, immediateRender: true }, 2.56);
  tl.fromTo(glint, { opacity: 1 }, { opacity: 0, duration: 0.06 }, 2.86);
  return undo;
}

/* =============================================================================
 * 3. THE FINAL CALL TO ACTION — the last pinned stage: the call (14), into
 *    time (15) and the countdown (16), where the page ends
 * ============================================================================= */
export const CTA_END = 5.2;
const CTA_REDUCED_END = 3.2;

export function buildCta(section: HTMLElement, stage: HTMLElement, desktop: boolean, reduced: boolean, starsDim?: HTMLElement | null) {
  const $ = picker(stage);
  const X = (desk: number, phone: number) => `${desktop ? desk : phone}vw`;
  const END = reduced ? CTA_REDUCED_END : CTA_END;
  sizePinned(section, END, reduced ? BEAT_REDUCED : BEAT);

  // FINAL CTA ScrollTrigger: the stage is sticky inside `section`. It starts
  // as the stage comes up the screen, not once it is pinned, so the host,
  // the silk, the gold and the dust are already arriving as How it works
  // dissolves above them (buildSteps' way out): there is no empty screen
  // between the steps and the call. While it is on screen the host is
  // allowed to breathe (data-idle, CSS).
  const tl = pinnedTimeline(section, END, reduced ? true : 0.6, {
    start: "top 72%",
    onToggle: (self) => { stage.dataset.idle = self.isActive ? "on" : "off"; },
  });

  if (reduced) {
    // The host fades in at his final position; nothing moves.
    tl.fromTo($("cta-dust", "cta-silk", "cta-gold", "cta-host"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0.1);
    tl.fromTo($("cta-headline", "cta-line", "cta-button", "cta-note"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0.45);
    // 15–16: the call gives way to the countdown, in place.
    tl.to($("cta-host", "cta-headline", "cta-line", "cta-button", "cta-note"), { autoAlpha: 0, duration: 0.3 }, 1.6);
    tl.fromTo($("time-ground"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 1.7);
    tl.fromTo($("time-ring"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 1.8);
    tl.set($("time-arc"), { strokeDashoffset: 0 }, 1.8);
    tl.set($("time-tick"), { opacity: 1 }, 1.8);
    tl.fromTo($("cd-eyebrow", "cd-title", "cd-unit", "cd-sep", "cd-now", "cd-apply", "cd-sound"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 2.0);
    return tl;
  }

  gsap.set($("cta-host", "cta-headline", "cta-line", "cta-button"), { filter: "blur(0px)" });

  // 14: silk, gold and dust come back, over the sky, as the stage rises. The
  // stage keeps them low in its frame, which is still below the screen while
  // it rises, so they start raised within it (counter to the scroll: their
  // lift shrinks exactly as the stage comes up) and hold on screen, sweeping
  // in from their sides; they are in place as it pins. RISE is how much of
  // the timeline the rise takes (72svh of the scroll, from "top 72%").
  const RISE = (72 * END) / (END * BEAT + 72);
  tl.fromTo($("cta-dust"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.45 }, 0.02);
  tl.fromTo($("cta-silk"), { y: "-62vh" }, { y: 0, ease: "none", duration: RISE }, 0);
  tl.fromTo($("cta-silk"), { autoAlpha: 0, x: X(40, 60), rotation: 6 }, { autoAlpha: 1, x: 0, rotation: 0, ease: "power2.out", duration: 0.9 }, 0.02);
  tl.fromTo($("cta-gold"), { y: "-58vh" }, { y: 0, ease: "none", duration: RISE }, 0);
  tl.fromTo($("cta-gold"), { autoAlpha: 0, x: X(-50, -70), rotation: -8, scale: 0.9 }, { autoAlpha: 0.9, x: 0, rotation: 0, scale: 1, ease: "power2.out", duration: 0.9 }, 0.05);
  // The host steps out of the glow: a slow push, blur to sharp.
  tl.fromTo($("cta-host"), { autoAlpha: 0, scale: 0.9, y: "3vh", filter: "blur(10px)", transformOrigin: "50% 100%" },
    { autoAlpha: 1, scale: 1, y: 0, filter: "blur(0px)", ease: "power2.out", duration: 0.72 }, 0.15);
  // As he settles, and as the stage pins, the offer appears by his open hand.
  tl.set($("cta-headline"), { autoAlpha: 1 }, 0.6);
  textIn(tl, $("cta-headline")[0], "rise", 0.6, 0.45);
  tl.fromTo($("cta-headline"), { scale: 0.96, filter: "blur(6px)", transformOrigin: "0% 50%" },
    { scale: 1, filter: "blur(0px)", ease: "power2.out", duration: 0.42 }, 0.6);
  tl.set($("cta-line"), { autoAlpha: 1 }, 0.74);
  textIn(tl, $("cta-line")[0], "words", 0.74, 0.4);
  tl.fromTo($("cta-button"), { autoAlpha: 0, scale: 0.9, filter: "blur(8px)", transformOrigin: "0% 50%" },
    { autoAlpha: 1, scale: 1, filter: "blur(0px)", ease: "power2.out", duration: 0.38 }, 0.87);
  tl.fromTo($("cta-note"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 1.02);

  // 15: INTO TIME. The button swells and its gold floods the frame; the
  // frame warms instead of going dark; the call dissolves; the silk settles
  // low and the gold trail curls into an orbit; the sky quiets.
  tl.to($("cta-button"), { scale: 1.08, ease: "power1.inOut", duration: 0.4 }, 2.0);
  tl.fromTo($("cta-flood"), { autoAlpha: 0, scale: 0.15 }, { autoAlpha: 1, scale: 2.8, ease: "power2.in", duration: 0.55 }, 2.1);
  tl.to($("cta-flood"), { autoAlpha: 0, scale: 3.6, ease: "power1.out", duration: 0.6 }, 2.65);
  tl.fromTo($("time-ground"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 2.45);
  tl.to($("cta-host", "cta-headline", "cta-line", "cta-note", "cta-button"), { autoAlpha: 0, filter: "blur(10px)", duration: 0.4 }, 2.2);
  tl.to($("cta-silk"), { x: X(-6, -10), y: "9vh", rotation: -3, autoAlpha: 0.8, ease: "power2.inOut", duration: 1.0 }, 2.3);
  tl.to($("cta-gold"), { rotation: 16, scale: 1.12, autoAlpha: 0.55, ease: "power2.inOut", duration: 1.2 }, 2.3);
  if (starsDim) tl.to(starsDim, { opacity: 0.55, duration: 0.6 }, 2.3);
  // A clock face pulls in from beyond the screen, turning; its ticks light in turn.
  tl.fromTo($("time-ring"), { autoAlpha: 0, scale: 3.4, rotation: -40 }, { autoAlpha: 1, scale: 1, rotation: 0, ease: "power3.out", duration: 1.1 }, 2.55);
  tl.fromTo($("time-arc"), { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: "power2.inOut", duration: 0.9 }, 2.7);
  tl.fromTo($("time-tick"), { opacity: 0 }, { opacity: 1, duration: 0.12, stagger: 0.012 }, 2.75);

  // 16: THE COUNTDOWN assembles inside it: the date, then each figure out of
  // the camera (large and blurred, to its place), then today in India, the
  // speaker in the corner and the way in. The figures are live already
  // (Scene16Countdown).
  tl.set($("cd-eyebrow", "cd-title"), { autoAlpha: 1 }, 3.05);
  textIn(tl, $("cd-eyebrow")[0], "type", 3.05, 0.3);
  textIn(tl, $("cd-title")[0], "scramble", 3.1, 0.5);
  tl.fromTo($("cd-unit"), { autoAlpha: 0, scale: 1.7, filter: "blur(16px)" }, { autoAlpha: 1, scale: 1, filter: "blur(0px)", ease: "power3.out", duration: 0.6, stagger: 0.16 }, 3.3);
  tl.fromTo($("cd-sep"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, stagger: 0.16 }, 3.45);
  tl.fromTo($("cd-now"), { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, ease: "power2.out", duration: 0.4 }, 3.95);
  tl.fromTo($("cd-sound"), { autoAlpha: 0, scale: 0.5, rotation: -25 }, { autoAlpha: 1, scale: 1, rotation: 0, ease: "back.out(2.2)", duration: 0.45 }, 4.0);
  tl.fromTo($("cd-apply"), { autoAlpha: 0, y: 16, scale: 0.94 }, { autoAlpha: 1, y: 0, scale: 1, ease: "power2.out", duration: 0.45 }, 4.1);
  // Then it holds on the live clock, the face still turning slowly with the scroll.
  tl.to($("time-ring"), { rotation: 14, ease: "none", duration: 1.55 }, 3.65);
  tl.to($("cta-gold"), { rotation: 26, ease: "none", duration: 1.55 }, 3.65);
  return tl;
}

/* =============================================================================
 * 4. THE SKY — not pinned
 * The star layers drift at different speeds as the page scrolls (depth: the
 * nearer, the faster), and the whole sky leaves with the end of the page, so
 * the fixed layer never sits over the footer.
 * ============================================================================= */
export function buildStars(page: HTMLElement, stars: HTMLElement, reduced: boolean) {
  const $ = picker(stars);
  // THE SKY'S drift ScrollTrigger: the whole page, gently smoothed. None
  // under reduced motion: the stars simply stay where they are.
  if (!reduced) {
    gsap
      .timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: page, start: "top top", end: "bottom bottom", scrub: 1, invalidateOnRefresh: true },
      })
      .to($("stars-far"), { yPercent: -3 }, 0)
      .to($("stars-mid", "stars-mid2"), { yPercent: -7 }, 0)
      .to($("stars-bright"), { yPercent: -11 }, 0);
  }
  // THE SKY'S exit ScrollTrigger: as the footer arrives, the sky moves up
  // exactly as far as the page does, its bottom edge on the page's.
  gsap.fromTo(
    stars,
    { y: 0 },
    {
      y: () => -window.innerHeight,
      ease: "none",
      scrollTrigger: { trigger: page, start: "bottom bottom", end: "bottom top", scrub: true, invalidateOnRefresh: true },
    },
  );
}

/** Register once, client-side only. */
export function registerGsap() {
  gsap.registerPlugin(ScrollTrigger, SplitText);
}
