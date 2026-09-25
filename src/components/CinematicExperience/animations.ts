import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { GatherField } from "./particles";
import { ROUTE_POINTS } from "./Scene05Globe";

/**
 * Every timeline on /free-china-trip/, and nothing else.
 *
 * SCROLL IS THE CAMERA. There are only three scroll-driven timelines on the
 * page, plus one one-shot reveal:
 *
 *   1. THE FILM (buildFilm*): one pinned stage, one scrubbed timeline, chapters
 *      01–11, from the traveller to What's included. One timeline so that the
 *      silk and the gold, and every hand-off (plane -> globe -> map -> the
 *      cities), is continuous; there is no seam between sections to hide.
 *   2. HOW IT WORKS (buildSteps): not pinned; gold fills the line joining the
 *      three steps as the section passes.
 *   3. THE FINAL CALL TO ACTION (buildCta): the second pinned stage, the host,
 *      then the beat that carries you into the form (chapters 14–15).
 *   +  The form's heading resolves once when it arrives (buildApplyHeading).
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

/** Where each film chapter starts, in timeline units; the chapter readout uses it. */
export const FILM_CHAPTER_STARTS = [0, 0.55, 1.95, 3.1, 4.5, 6.5, 8.5, 11.75, 13.3, 15.65, 18.3];
export const FILM_END = 21.0;
export const FILM_REDUCED_STARTS = [0, 0.85, 1.95, 2.95, 3.95, 4.95, 5.95, 8.65, 9.55, 10.45, 11.45];
const FILM_REDUCED_END = 12.3;

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
  gsap.set($("city-yiwu"), { filter: "blur(0px) brightness(1)" });
  gsap.set($("globe-art"), { filter: "brightness(1) saturate(1)" });
  gsap.set($("boarding", "map"), { transformPerspective: 1400 });
  gsap.set($("route-head"), { x: ROUTE_POINTS[0].x, y: ROUTE_POINTS[0].y });
  gsap.set($("free-blur", "free-word", "free-glow", "free-sub-char"), { autoAlpha: 0 });
  gsap.set($("free-sweep"), { xPercent: -100 });
  gsap.set($("free-sweep-inner"), { xPercent: 24 });

  // THE FILM'S ScrollTrigger: the stage is sticky inside `film`; this reads
  // how far through `film` the page is and scrubs every chapter below.
  const tl = pinnedTimeline(film, FILM_END, 0.6, { onUpdate: (self) => hooks.onProgress(self.progress * FILM_END, self.progress) });

  const caption = (key: string, inAt: number, outAt: number) => {
    tl.fromTo($(key), { autoAlpha: 0, y: 26, filter: "blur(8px)" }, { autoAlpha: 1, y: 0, filter: "blur(0px)", ease: "power2.out", duration: 0.32 }, inAt);
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
    { autoAlpha: 0.85, x: X(-5, -10), y: vh(-27), rotation: -4, scale: 1, ease: "power1.inOut", duration: 0.9 }, 1.0);
  tl.to($("silk-front"), { x: X(-110, -150), y: vh(-34), rotation: -10, autoAlpha: 0, ease: "power1.in", duration: 0.55 }, 1.9);
  caption("cap-passport", 1.15, 2.0);

  // ---- 03 BOARDING PASS: small behind the passport, then the hero ------------
  tl.fromTo($("boarding"), { autoAlpha: 0, scale: 0.34, x: X(24, 22), y: vh(-20), rotation: 9, rotationY: -26, filter: "blur(10px)" },
    { autoAlpha: 0.75, scale: 0.42, filter: "blur(6px)", ease: "power1.out", duration: 0.6 }, 1.15);
  tl.to($("boarding"), { autoAlpha: 1, scale: d ? 0.96 : 1.02, x: 0, y: 0, rotation: -2, rotationY: 0, rotationX: 8, filter: "blur(0px)", ease: "power2.inOut", duration: 0.95 }, 1.95);
  // Floating while held.
  tl.to($("boarding"), { y: vh(-2), rotationX: 0, rotation: -3.5, ease: "sine.inOut", duration: 0.75 }, 2.9);
  // The light sweep across the paper.
  tl.fromTo($("boarding-sweep"), { xPercent: -110 }, { xPercent: 110, ease: "power1.inOut", duration: 0.7 }, 2.55);
  tl.to($("boarding"), { autoAlpha: 0, scale: 0.72, x: X(30, 40), y: vh(-26), rotation: 7, filter: "blur(10px)", ease: "power2.in", duration: 0.6 }, 3.6);
  caption("cap-boarding", 2.6, 3.5);

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
  caption("cap-plane", 3.9, 4.9);
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
  caption("cap-globe", 5.3, 6.35);
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
  caption("cap-map", 7.2, 8.2);
  // Dive into the Shanghai marker (30% right of centre): the city pass starts there.
  tl.to($("map"), { scale: 3.6, xPercent: -(3.6 - 1.05) * 30, autoAlpha: 0, filter: "blur(10px)", ease: "power2.in", duration: 0.8 }, 8.35);

  // ---- 07 CITY JOURNEY: one continuous pass through three skylines ---------
  // Each city rises from depth, holds while the camera glides, then rushes past
  // the lens as the next one emerges behind it. Shanghai rises from where its
  // marker was on the map.
  const city = (key: string, at: number, from: string, rest: string, glide: string, exit: string) => {
    tl.fromTo($(`city-${key}`), { autoAlpha: 0, scale: 0.22, x: from, y: vh(2), filter: "blur(14px)" },
      { autoAlpha: 1, scale: d ? 0.94 : 1, x: rest, y: 0, filter: "blur(0px)", ease: "power2.out", duration: 0.8 }, at);
    tl.to($(`city-${key}`), { scale: d ? 1.06 : 1.12, x: glide, duration: 0.5 }, at + 0.8);
    tl.to($(`city-${key}`), { scale: 2.2, x: exit, y: vh(4), autoAlpha: 0, filter: "blur(16px)", ease: "power2.in", duration: 0.6 }, at + 1.3);
    caption(`cap-${key}`, at + 0.5, at + 1.3);
  };
  city("shanghai", 8.5, X(19, 37), X(2, 0), X(-3, -4), X(-46, -60));
  city("beijing", 9.6, X(14, 20), X(-1, 0), X(-5, -5), X(-50, -64));
  city("guangzhou", 10.7, X(12, 18), X(0, 0), X(-4, -5), X(-48, -62));
  // Silk weaves between Shanghai and Beijing, gold between Beijing and Guangzhou.
  tl.fromTo($("silk-back"), { autoAlpha: 0, x: X(90, 120), y: vh(-14), rotation: 12, scale: 0.8 },
    { autoAlpha: 0.8, x: X(0, 0), y: vh(-2), rotation: 3, ease: "power1.out", duration: 0.5 }, 9.3);
  tl.to($("silk-back"), { autoAlpha: 0, x: X(-90, -120), y: vh(10), rotation: -6, ease: "power1.in", duration: 0.5 }, 9.8);
  tl.fromTo($("gold-front"), { autoAlpha: 0, x: X(110, 150), y: vh(-6), rotation: -10, scale: 0.9 },
    { autoAlpha: 0.8, x: X(0, 0), y: vh(4), rotation: -2, ease: "power1.out", duration: 0.4 }, 10.4);
  tl.to($("gold-front"), { autoAlpha: 0, x: X(-120, -160), y: vh(12), rotation: 6, ease: "power1.in", duration: 0.4 }, 10.8);

  // ---- 08 YIWU: arrival, and the camera gently approaches ------------------------
  tl.fromTo($("city-yiwu"), { autoAlpha: 0, scale: 0.26, x: X(12, 16), y: vh(3), filter: "blur(14px) brightness(1)" },
    { autoAlpha: 1, scale: d ? 0.98 : 1.06, x: 0, y: 0, filter: "blur(0px) brightness(1)", ease: "power3.out", duration: 1.0 }, 11.75);
  tl.to($("city-yiwu"), { scale: d ? 1.1 : 1.18, y: vh(1), duration: 1.05 }, 12.75);
  caption("cap-yiwu", 12.3, 13.4);

  // ---- 09 HOTEL: darken, gold, silk, then the hotel ---------------------------------
  tl.fromTo($("veil"), { autoAlpha: 0 }, { autoAlpha: 0.6, duration: 0.6 }, 13.35);
  tl.to($("city-yiwu"), { filter: "blur(6px) brightness(0.55)", duration: 0.6 }, 13.35);
  tl.fromTo($("gold-front"), { autoAlpha: 0, x: X(-110, -150), y: vh(10), rotation: 8, scale: 1 },
    { autoAlpha: 0.9, x: X(0, 0), y: vh(0), rotation: 0, ease: "power1.out", duration: 0.4 }, 13.55);
  tl.to($("gold-front"), { autoAlpha: 0, x: X(110, 150), y: vh(-10), rotation: -8, ease: "power1.in", duration: 0.4 }, 13.95);
  tl.fromTo($("silk-front"), { autoAlpha: 0, x: X(110, 150), y: vh(16), rotation: 12, scale: 1.2 },
    { autoAlpha: 1, x: X(0, 0), y: vh(4), rotation: 2, ease: "power1.out", duration: 0.4 }, 13.8);
  tl.to($("silk-front"), { autoAlpha: 0, x: X(-120, -160), y: vh(-10), rotation: -10, ease: "power1.in", duration: 0.4 }, 14.2);
  tl.to($("city-yiwu"), { autoAlpha: 0, duration: 0.45 }, 14.05);
  tl.to($("veil"), { autoAlpha: 0.25, duration: 0.5 }, 14.1);
  tl.fromTo($("hotel"), { autoAlpha: 0, scale: 1.18, filter: "blur(12px)" },
    { autoAlpha: 1, scale: 1, filter: "blur(0px)", ease: "power2.out", duration: 0.85 }, 14.0);
  tl.to($("hotel"), { scale: 1.06, duration: 0.9 }, 14.85);
  tl.fromTo($("hotel-glow"), { autoAlpha: 0, scale: 0.7 }, { autoAlpha: 0.9, scale: 1, duration: 0.9 }, 14.2);
  tl.to($("haze-crimson"), { autoAlpha: 0, duration: 0.6 }, 13.9);
  tl.to($("haze-warm"), { autoAlpha: 1, duration: 0.6 }, 13.9);
  caption("cap-hotel", 14.45, 15.5);

  // ---- 10 FREE: everything goes dark; particles gather; the word resolves --
  tl.to($("hotel"), { autoAlpha: 0, scale: 1.14, filter: "blur(12px)", ease: "power2.in", duration: 0.6 }, 15.7);
  tl.to($("hotel-glow"), { autoAlpha: 0, duration: 0.5 }, 15.7);
  tl.to($("veil"), { autoAlpha: 0, duration: 0.4 }, 15.9);
  tl.to($("haze-warm"), { autoAlpha: 0, duration: 0.5 }, 15.7);
  // Silk and gold keep moving through the dark, framing the word.
  tl.fromTo($("silk-back"), { autoAlpha: 0, x: X(70, 90), y: vh(26), rotation: 8, scale: 1.1 },
    { autoAlpha: 0.42, x: X(8, 0), y: vh(30), rotation: 2, scale: 1.15, ease: "power1.out", duration: 1.0 }, 15.8);
  tl.to($("silk-back"), { x: X(-20, -30), y: vh(32), rotation: -3, duration: 1.5 }, 16.8);
  tl.fromTo($("gold-back"), { autoAlpha: 0, x: X(-70, -90), y: vh(-24), rotation: -8, scale: 1 },
    { autoAlpha: 0.45, x: X(-4, 0), y: vh(-30), rotation: -2, scale: 1.1, ease: "power1.out", duration: 1.0 }, 15.9);
  tl.to($("gold-back"), { x: X(16, 24), y: vh(-32), rotation: 3, duration: 1.4 }, 16.9);
  // Particles gather into the shape of the word.
  const dust = { gather: 0, fade: 0 };
  const draw = () => particles?.render(dust.gather, dust.fade);
  tl.fromTo($("free-particles"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.1 }, 16.0);
  tl.fromTo(dust, { gather: 0 }, { gather: 1, ease: "power1.inOut", duration: 1.0, onUpdate: draw }, 16.0);
  // The word: blur -> sharp, a slow settle, glow, then the particles dissolve into it.
  tl.fromTo($("free-lockup"), { autoAlpha: 0, scale: 1.06 }, { autoAlpha: 1, scale: 1, ease: "power2.out", duration: 1.1 }, 16.55);
  tl.fromTo($("free-blur"), { autoAlpha: 0 }, { autoAlpha: 0.9, duration: 0.4 }, 16.6);
  tl.fromTo($("free-word"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, 16.8);
  tl.to($("free-blur"), { autoAlpha: 0, duration: 0.45 }, 17.05);
  tl.fromTo($("free-glow"), { autoAlpha: 0, scale: 0.85 }, { autoAlpha: 1, scale: 1, ease: "power2.out", duration: 0.7 }, 16.75);
  tl.fromTo(dust, { fade: 0 }, { fade: 1, duration: 0.5, onUpdate: draw }, 16.85);
  tl.to($("free-particles"), { autoAlpha: 0, duration: 0.1 }, 17.4);
  // One sweep of light across the letters.
  tl.fromTo($("free-sweep"), { xPercent: -100 }, { xPercent: 416.667, ease: "power1.inOut", duration: 0.65 }, 17.2);
  tl.fromTo($("free-sweep-inner"), { xPercent: 24 }, { xPercent: -100, ease: "power1.inOut", duration: 0.65 }, 17.2);
  // CHINA BUSINESS TRIP, letter by letter.
  tl.fromTo($("free-sub-char"), { autoAlpha: 0, y: 14, filter: "blur(8px)" },
    { autoAlpha: 1, y: 0, filter: "blur(0px)", ease: "power2.out", duration: 0.3, stagger: 0.022 }, 17.35);

  // ---- 11 WHAT'S INCLUDED: the lockup rises; four rows arrive in turn ------
  tl.to($("free-lockup"), { y: vh(d ? -31 : -30), scale: d ? 0.36 : 0.5, ease: "power3.inOut", duration: 0.75 }, 18.3);
  tl.to($("free-glow"), { autoAlpha: 0.4, duration: 0.6 }, 18.3);
  tl.to($("silk-back", "gold-back"), { autoAlpha: 0.22, duration: 0.6 }, 18.3);
  tl.fromTo($("inc-eyebrow"), { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.3 }, 18.85);
  $("inc-row").forEach((row, i) => {
    const at = 18.95 + i * 0.36;
    tl.fromTo(row.querySelector("[data-cx='inc-line']"), { scaleX: 0 }, { scaleX: 1, ease: "power2.inOut", duration: 0.55 }, at - 0.08);
    tl.fromTo(row, { autoAlpha: 0, y: 34, filter: "blur(8px)" }, { autoAlpha: 1, y: 0, filter: "blur(0px)", ease: "power2.out", duration: 0.42 }, at);
  });
  tl.to($("hud"), { autoAlpha: 0, duration: 0.3 }, FILM_END - 0.45);

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
  fade(["city-shanghai", "cap-shanghai"], s[6], s[6] + 0.6);
  fade(["city-beijing", "cap-beijing"], s[6] + 0.9, s[6] + 1.5);
  fade(["city-guangzhou", "cap-guangzhou"], s[6] + 1.8, s[7] - 0.3);
  fade(["city-yiwu", "cap-yiwu"], s[7], s[8] - 0.3);
  fade(["hotel", "hotel-glow", "cap-hotel"], s[8], s[9] - 0.3);
  tl.to($("haze-crimson"), { autoAlpha: 0, duration: 0.25 }, s[9] - 0.3);
  fade(["free-lockup"], s[9], s[10] - 0.35);
  // Moved to its small position while invisible, so nothing is seen to move.
  tl.set($("free-lockup"), { y: `${desktop ? -31 : -30}vh`, scale: desktop ? 0.36 : 0.5 }, s[10] - 0.05);
  fade(["free-lockup", "inc-eyebrow", "inc-row"], s[10]);
  tl.to($("hud"), { autoAlpha: 0, duration: 0.2 }, END - 0.3);
  return tl;
}

/* =============================================================================
 * 2. HOW IT WORKS — not pinned; gold fills the line as the section passes
 * ============================================================================= */
export function buildSteps(section: HTMLElement, desktop: boolean, reduced: boolean) {
  const fill = section.querySelector<HTMLElement>("[data-cx='steps-fill']");
  const steps = section.querySelectorAll<HTMLElement>("[data-cx='step']");
  const list = section.querySelector("ol");
  if (!fill || !list) return;
  const axis = desktop ? "scaleX" : "scaleY";
  if (reduced) {
    gsap.set(fill, { [axis]: 1 });
    return;
  }
  // HOW IT WORKS ScrollTrigger: scrubbed over the list's passage up the screen.
  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: { trigger: list, start: "top 78%", end: "bottom 58%", scrub: 0.6, invalidateOnRefresh: true },
  });
  tl.fromTo(fill, { [axis]: 0 }, { [axis]: 1, duration: 1 }, 0);
  steps.forEach((step, i) => {
    tl.fromTo(step, { autoAlpha: 0.2, y: 26 }, { autoAlpha: 1, y: 0, ease: "power2.out", duration: 0.24 }, i * 0.36);
  });
}

/* =============================================================================
 * 3. THE FINAL CALL TO ACTION — second pinned stage, chapters 14–15
 * ============================================================================= */
export const CTA_END = 3.4;
const CTA_REDUCED_END = 2.2;

export function buildCta(section: HTMLElement, stage: HTMLElement, desktop: boolean, reduced: boolean) {
  const $ = picker(stage);
  const X = (desk: number, phone: number) => `${desktop ? desk : phone}vw`;
  const END = reduced ? CTA_REDUCED_END : CTA_END;
  sizePinned(section, END, reduced ? BEAT_REDUCED : BEAT);

  // FINAL CTA ScrollTrigger: the stage is sticky inside `section`. While it is
  // on screen the host is allowed to breathe (data-idle, CSS).
  const tl = pinnedTimeline(section, END, reduced ? true : 0.6, {
    onToggle: (self) => { stage.dataset.idle = self.isActive ? "on" : "off"; },
  });

  if (reduced) {
    // The host fades in at his final position; nothing moves.
    tl.to($("cta-bg"), { autoAlpha: 0, duration: 0.3 }, 0);
    tl.fromTo($("cta-dust", "cta-silk", "cta-gold", "cta-host"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0.1);
    tl.fromTo($("cta-headline", "cta-line", "cta-button", "cta-note"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0.45);
    tl.fromTo($("cta-dark"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 1.6);
    tl.fromTo($("cta-horizon"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, 1.85);
    return tl;
  }

  gsap.set($("cta-host", "cta-headline", "cta-line", "cta-button"), { filter: "blur(0px)" });

  // 14: the frame darkens; silk, gold and dust come back.
  tl.to($("cta-bg"), { autoAlpha: 0, duration: 0.6 }, 0);
  tl.fromTo($("cta-dust"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, 0.15);
  tl.fromTo($("cta-silk"), { autoAlpha: 0, x: X(40, 60), y: "8vh", rotation: 6 }, { autoAlpha: 1, x: 0, y: 0, rotation: 0, ease: "power2.out", duration: 0.9 }, 0.1);
  tl.fromTo($("cta-gold"), { autoAlpha: 0, x: X(-50, -70), rotation: -8, scale: 0.9 }, { autoAlpha: 0.9, x: 0, rotation: 0, scale: 1, ease: "power2.out", duration: 0.9 }, 0.2);
  // The host steps out of the glow: a slow push, blur to sharp.
  tl.fromTo($("cta-host"), { autoAlpha: 0, scale: 0.9, y: "3vh", filter: "blur(10px)", transformOrigin: "50% 100%" },
    { autoAlpha: 1, scale: 1, y: 0, filter: "blur(0px)", ease: "power2.out", duration: 0.85 }, 0.35);
  // Just after he settles, the offer appears by his open hand.
  tl.fromTo($("cta-headline"), { autoAlpha: 0, scale: 0.96, filter: "blur(10px)", transformOrigin: "0% 50%" },
    { autoAlpha: 1, scale: 1, filter: "blur(0px)", ease: "power2.out", duration: 0.45 }, 1.15);
  tl.fromTo($("cta-line"), { autoAlpha: 0, y: 14, filter: "blur(6px)" }, { autoAlpha: 1, y: 0, filter: "blur(0px)", ease: "power2.out", duration: 0.4 }, 1.3);
  tl.fromTo($("cta-button"), { autoAlpha: 0, scale: 0.9, filter: "blur(8px)", transformOrigin: "0% 50%" },
    { autoAlpha: 1, scale: 1, filter: "blur(0px)", ease: "power2.out", duration: 0.4 }, 1.45);
  tl.fromTo($("cta-note"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 1.6);

  // 15: CTA -> form. The button swells, gold floods out, the frame goes dark,
  // and a horizon of warm light is left for the form to pick up.
  tl.to($("cta-button"), { scale: 1.08, ease: "power1.inOut", duration: 0.4 }, 2.4);
  tl.fromTo($("cta-flood"), { autoAlpha: 0, scale: 0.15 }, { autoAlpha: 1, scale: 3.6, ease: "power2.in", duration: 0.55 }, 2.5);
  tl.to($("cta-host", "cta-headline", "cta-line", "cta-note"), { autoAlpha: 0, filter: "blur(10px)", duration: 0.4 }, 2.6);
  tl.to($("cta-silk", "cta-gold"), { autoAlpha: 0, duration: 0.4 }, 2.6);
  tl.fromTo($("cta-dark"), { autoAlpha: 0 }, { autoAlpha: 1, ease: "power1.in", duration: 0.4 }, 2.85);
  tl.fromTo($("cta-horizon"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 3.05);
  return tl;
}

/* =============================================================================
 * +  The form heading resolves once, as it arrives (one-shot, not scrubbed)
 * ============================================================================= */
export function buildApplyHeading(head: HTMLElement, reduced: boolean) {
  if (reduced) return;
  gsap.fromTo(
    Array.from(head.children),
    { autoAlpha: 0, y: 26, filter: "blur(10px)" },
    {
      autoAlpha: 1,
      y: 0,
      filter: "blur(0px)",
      duration: 1,
      stagger: 0.12,
      ease: "power3.out",
      clearProps: "filter",
      scrollTrigger: { trigger: head, start: "top 88%", once: true },
    },
  );
}

/** Register once, client-side only. */
export function registerGsap() {
  gsap.registerPlugin(ScrollTrigger);
}
