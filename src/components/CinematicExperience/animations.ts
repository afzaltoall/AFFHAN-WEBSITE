import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ANCHORS } from "./assets";
import type { GatherField } from "./particles";
import { ROUTE_POINTS } from "./Scene05Globe";

/**
 * Every timeline on /free-china-trip/, and nothing else.
 *
 * SCROLL IS THE CAMERA. There are only three scroll-driven timelines on the
 * page, plus one one-shot reveal:
 *
 *   1. THE FILM (buildFilm*): one pinned stage, one scrubbed timeline: first
 *      the time opener (00, buildOpener: spark, clock, orbit, globe, China,
 *      silk, plane, into the hero), then chapters 01–11, from the traveller to
 *      What's included. One timeline so that the silk and the gold, and every
 *      hand-off, is continuous; there is no seam between sections to hide.
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

/**
 * THE OPENER'S LENGTH, in vh of scrolling: the one number to tune after
 * feeling it live (500–800 is the sensible range). Every beat in buildOpener
 * is placed as a fraction of it, so changing this changes nothing else.
 */
export const OPENER_SCROLL_VH = 600;
const OPENER_UNITS = OPENER_SCROLL_VH / BEAT;
/** Reduced motion: the same beats as dissolves, over a shorter scroll. */
const OPENER_REDUCED_UNITS = 3.2;

/** A point and a width inside a picture, as fractions of it (see ANCHORS). */
type Anchor = { cx: number; cy: number; w: number };

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
  /** The night sky's dimmer (Starfield.tsx): lowered under the FREE reveal. */
  starsDim?: HTMLElement | null;
}

/* =============================================================================
 * 0. THE TIME OPENER — the first stretch of the film's master timeline
 * TIME -> CLOCK -> ORBIT -> GLOBE -> CHINA -> RED SILK -> GOLD TRAIL ->
 * AIRPLANE -> TRAVELLER -> the hero. Built into the same pinned stage and the
 * same scrubbed timeline as the film (no second trigger, no second pin), and
 * placed in fractions of its own length O, so OPENER_SCROLL_VH retunes it
 * without touching a beat. Labels on the master mark each beat; at
 * "heroComplete" the hero stands exactly as it did before the opener existed.
 * ============================================================================= */

const OPENER_LABELS: ReadonlyArray<[string, number]> = [
  ["timeStart", 0],
  ["clockOpen", 0.12],
  ["orbit", 0.25],
  ["globe", 0.4],
  ["china", 0.52],
  ["silk", 0.65],
  ["flight", 0.75],
  ["heroReveal", 0.9],
  ["heroComplete", 1],
];

/**
 * The match cut. Returns the x / y / scale that land the picture `key` so its
 * point `own` sits on the point `inHero` of the hero composite, at the same
 * width. Measured with transforms cleared, so it is the resting geometry
 * whatever the timeline has done; as functions, so ScrollTrigger re-measures
 * on every refresh (resize, rotation).
 */
function landOnHero(stage: HTMLElement, key: string, own: Anchor, inHero: Anchor) {
  const rest = (el: HTMLElement | null) => {
    if (!el) return null;
    const prev = el.style.transform;
    el.style.transform = "none";
    const r = el.getBoundingClientRect();
    el.style.transform = prev;
    return r;
  };
  const get = () => {
    const hero = rest(stage.querySelector<HTMLElement>("[data-cx='hero-img']"));
    const el = rest(stage.querySelector<HTMLElement>(`[data-cx='${key}']`));
    if (!hero || !el || !el.width) return { x: 0, y: 0, scale: 1 };
    const scale = (inHero.w * hero.width) / (own.w * el.width);
    const tx = hero.left + inHero.cx * hero.width;
    const ty = hero.top + inHero.cy * hero.height;
    // Scale works about the element's centre; the point `own` sits
    // (own - 0.5) of the element's size away from it.
    return {
      x: tx - (el.left + el.width / 2) - (own.cx - 0.5) * el.width * scale,
      y: ty - (el.top + el.height / 2) - (own.cy - 0.5) * el.height * scale,
      scale,
    };
  };
  return { x: () => get().x, y: () => get().y, scale: () => get().scale };
}

function buildOpener(tl: gsap.core.Timeline, stage: HTMLElement, d: boolean, O: number, starsDim: HTMLElement | null) {
  const $ = picker(stage);
  const at = (p: number) => p * O;
  const len = (p: number) => p * O;
  const X = (desk: number, phone: number) => `${d ? desk : phone}vw`;
  const vh = (n: number) => `${n}vh`;
  for (const [name, p] of OPENER_LABELS) tl.addLabel(name, at(p));

  // The first frame: black, a spark, and a sky barely there yet.
  gsap.set($("op-orb", "op-orb-front"), { transformPerspective: 1600 });
  if (starsDim) gsap.set(starsDim, { opacity: 0.12 });
  const reveal = { autoAlpha: 1, y: 0, filter: "blur(0px)", ease: "power3.out" };
  const hidden = { autoAlpha: 0, y: 30, filter: "blur(8px)" };

  // ---- 0.00 timeStart: the first spark ---------------------------------------
  tl.to($("op-cue"), { autoAlpha: 0, duration: len(0.06) }, at(0.02));
  tl.to($("op-spark"), { scale: 2.6, ease: "power1.in", duration: len(0.1) }, at(0.02));
  tl.fromTo($("op-core"), { autoAlpha: 0, scale: 0.2 }, { autoAlpha: 0.85, scale: 0.55, ease: "power2.out", duration: len(0.12) }, at(0.04));
  tl.fromTo($("op-warm"), { opacity: 0.4 }, { opacity: 1, duration: len(0.3) }, at(0));

  // ---- 0.12 clockOpen: the spark becomes a clock ---------------------------------
  tl.fromTo($("op-orb"), { autoAlpha: 0, scale: 0.5, filter: "blur(8px)" }, { autoAlpha: 1, scale: 0.85, filter: "blur(0px)", ease: "power2.out", duration: len(0.1) }, at(0.1));
  tl.fromTo($("op-ticks"), { autoAlpha: 0 }, { autoAlpha: 1, duration: len(0.08) }, at(0.12));
  tl.fromTo($("op-hand"), { autoAlpha: 0 }, { autoAlpha: 1, duration: len(0.06) }, at(0.13));
  tl.fromTo($("op-hand"), { rotation: -30 }, { rotation: 40, duration: len(0.13) }, at(0.12));
  tl.to($("op-spark"), { scale: 0.8, ease: "power2.out", duration: len(0.08) }, at(0.12));
  // TIME MOVES. / SO SHOULD YOU.: each line rises out of its mask, blur to sharp.
  [1, 2].forEach((n, i) => {
    const t = at(0.13 + i * 0.055);
    tl.fromTo($(`op-word-${n}`), { autoAlpha: 0, y: 30, filter: "blur(8px)" }, { ...reveal, duration: len(0.07) }, t);
    tl.fromTo($(`op-word-${n}-in`), { yPercent: 105 }, { yPercent: 0, ease: "power3.out", duration: len(0.07) }, t);
  });
  tl.to($("op-word-1", "op-word-2"), { autoAlpha: 0, y: -24, filter: "blur(8px)", ease: "power1.in", duration: len(0.06) }, at(0.3));

  // ---- 0.25 orbit: the clock stops being a clock ----------------------------------
  tl.to($("op-hand"), { rotation: 760, ease: "power2.in", duration: len(0.15) }, at(0.25));
  tl.to($("op-hand"), { autoAlpha: 0, duration: len(0.05) }, at(0.35));
  tl.to($("op-ticks"), { autoAlpha: 0, scale: 1.06, duration: len(0.08) }, at(0.25));
  tl.to($("op-orb"), { scale: 1.4, rotationX: 72, ease: "power2.inOut", duration: len(0.16) }, at(0.26));
  tl.fromTo($("op-orb-front"), { scale: 0.85, rotationX: 0 }, { scale: 1.4, rotationX: 72, ease: "power2.inOut", duration: len(0.16) }, at(0.26));
  tl.fromTo($("op-orb-front"), { autoAlpha: 0 }, { autoAlpha: 1, duration: len(0.06) }, at(0.33));
  // The light sweep: the bright part of the ring travels round it.
  tl.fromTo($("op-orb-spin"), { rotation: 0 }, { rotation: 320, duration: len(0.38) }, at(0.24));
  // The centre glows into a small world, and the sky arrives with it.
  tl.to($("op-core"), { scale: 1.25, duration: len(0.14) }, at(0.26));
  tl.to($("op-spark"), { autoAlpha: 0, scale: 0.3, duration: len(0.06) }, at(0.3));
  if (starsDim) tl.fromTo(starsDim, { opacity: 0.12 }, { opacity: 1, duration: len(0.16) }, at(0.3));

  // ---- 0.40 globe: the world out of the glow; the camera pushes to Asia ------------
  tl.fromTo($("op-globe"), { autoAlpha: 0, scale: 0.35, xPercent: 0, yPercent: 0, filter: "blur(14px)" }, { autoAlpha: 1, scale: 0.75, filter: "blur(0px)", ease: "power2.out", duration: len(0.12) }, at(0.31));
  tl.to($("op-core"), { autoAlpha: 0, duration: len(0.08) }, at(0.38));
  tl.to($("op-globe"), { scale: 1.15, xPercent: -6, yPercent: 9, ease: "power1.inOut", duration: len(0.11) }, at(0.42));
  tl.to($("op-orb", "op-orb-front"), { scale: 1.7, duration: len(0.1) }, at(0.42));
  // The route: the gold trail laid over India to China and drawn on.
  // Laid along the line from southern India to the hub over China (about
  // -26°, a little above the globe's centre), at roughly that length.
  tl.set($("op-trail"), { x: X(-2.7, -3), y: vh(-3), rotation: -26, scale: 0.22, filter: "brightness(1)" }, at(0.46));
  tl.fromTo($("op-trail"), { autoAlpha: 0 }, { autoAlpha: 1, duration: len(0.02) }, at(0.47));
  tl.fromTo($("op-trail-window"), { xPercent: -100 }, { xPercent: 0, ease: "power1.inOut", duration: len(0.1) }, at(0.47));
  tl.fromTo($("op-trail-img"), { xPercent: 100 }, { xPercent: 0, ease: "power1.inOut", duration: len(0.1) }, at(0.47));

  // ---- 0.52 china: dive into China; the map rises out of the dive ------------------
  // Zooming about the China hub: the translate that keeps it still is
  // -(s1 - s0) x its offset from centre (12% right, 19% up).
  const dive = 2.8;
  tl.to($("op-globe"), { scale: dive, xPercent: -6 - (dive - 1.15) * 12, yPercent: 9 + (dive - 1.15) * 19, autoAlpha: 0, filter: "blur(12px)", ease: "power2.in", duration: len(0.11) }, at(0.53));
  tl.to($("op-orb", "op-orb-front"), { autoAlpha: 0, scale: 2.4, duration: len(0.09) }, at(0.52));
  tl.fromTo($("op-map"), { autoAlpha: 0, scale: 0.9, filter: "blur(10px)" }, { autoAlpha: 1, scale: 1.05, filter: "blur(0px)", ease: "power2.out", duration: len(0.1) }, at(0.56));
  tl.to($("op-map"), { scale: 1.2, duration: len(0.06) }, at(0.66));
  tl.fromTo($("op-map-glow"), { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: len(0.1) }, at(0.56));
  // The trail lifts off the globe and turns into the flight path.
  tl.to($("op-trail"), { x: X(-4, -6), y: vh(4), rotation: -14, scale: 1, ease: "power2.inOut", duration: len(0.13) }, at(0.6));

  // ---- 0.65 silk: the hero's own silk sweeps in on a curve ---------------------------
  // x and y on different eases: that is what bends the path.
  tl.fromTo($("hero-silk"), { autoAlpha: 0, x: X(70, 90), rotation: 16, scale: 1.3, filter: "blur(10px)" }, { autoAlpha: 1, x: X(26, 30), rotation: -4, scale: 1.1, filter: "blur(3px)", ease: "power2.out", duration: len(0.12) }, at(0.63));
  tl.fromTo($("hero-silk"), { y: vh(46) }, { y: vh(24), ease: "sine.inOut", duration: len(0.12) }, at(0.63));
  tl.to($("op-map"), { autoAlpha: 0, scale: 1.32, filter: "blur(8px)", ease: "power1.in", duration: len(0.09) }, at(0.72));
  tl.to($("op-map-glow"), { autoAlpha: 0, duration: len(0.09) }, at(0.72));

  // ---- 0.75 flight: the trail brightens; the plane rides it --------------------------
  tl.fromTo($("op-trail"), { filter: "brightness(1)" }, { filter: "brightness(1.7)", duration: len(0.07) }, at(0.73));
  const plane = landOnHero(stage, "op-plane", ANCHORS.planeInOwn, ANCHORS.heroPlane);
  tl.fromTo($("op-plane"), { autoAlpha: 0, x: X(-72, -80), y: vh(28), scale: 0.26, rotation: 7, filter: "blur(8px)" },
    { autoAlpha: 1, x: X(-16, -14), y: vh(8), scale: 0.5, rotation: 3, filter: "blur(2px)", ease: "power1.out", duration: len(0.08) }, at(0.74));
  // ...and lands on the plane painted in the hero, at its size and angle.
  tl.to($("op-plane"), { x: plane.x, y: plane.y, scale: plane.scale, rotation: 2.6, filter: "blur(0px)", ease: "power2.inOut", duration: len(0.1) }, at(0.82));
  tl.fromTo($("op-plane-smear"), { autoAlpha: 0 }, { autoAlpha: 0.45, duration: len(0.04) }, at(0.75));
  tl.to($("op-plane-smear"), { autoAlpha: 0, duration: len(0.05) }, at(0.86));
  // The silk drifts on to exactly its hero pose.
  tl.to($("hero-silk"), { x: 0, rotation: 0, scale: 1, filter: "blur(0px)", ease: "power2.inOut", duration: len(0.16) }, at(0.82));
  tl.to($("hero-silk"), { y: 0, ease: "sine.in", duration: len(0.16) }, at(0.82));

  // ---- 0.90 heroReveal: the hero reassembles under the plane ---------------------------
  tl.fromTo($("hero-img"), { autoAlpha: 0, scale: 0.92, filter: "blur(10px)" }, { autoAlpha: 1, scale: 1, filter: "blur(0px)", ease: "power2.out", duration: len(0.13) }, at(0.86));
  tl.fromTo($("hero-glow"), { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, ease: "power2.out", duration: len(0.14) }, at(0.86));
  tl.to($("op-plane"), { autoAlpha: 0, duration: len(0.06) }, at(0.93));
  tl.to($("op-trail"), { autoAlpha: 0, duration: len(0.08) }, at(0.88));
  // The passport and the boarding pass fly in and settle onto the ones painted there.
  ([
    ["op-ghost-passport", ANCHORS.passportInOwn, ANCHORS.heroPassport, -10, 14, 0],
    ["op-ghost-tickets", ANCHORS.ticketsInOwn, ANCHORS.heroTickets, 12, -8, 0.015],
  ] as const).forEach(([key, own, inHero, r0, r1, lag]) => {
    const to = landOnHero(stage, key, own, inHero);
    tl.fromTo($(key), { autoAlpha: 0, x: X(-4, 0), y: vh(12), scale: 0.5, rotation: r0, filter: "blur(8px)" },
      { autoAlpha: 0.95, x: X(4, 4), y: vh(6), scale: 0.75, rotation: r0 / 2, filter: "blur(2px)", ease: "power2.out", duration: len(0.05) }, at(0.84 + lag));
    // Arrives first, then dissolves into the painted one: never mid-flight.
    tl.to($(key), { x: to.x, y: to.y, scale: to.scale, rotation: r1, filter: "blur(0px)", ease: "power2.inOut", duration: len(0.05) }, at(0.88 + lag));
    tl.to($(key), { autoAlpha: 0, duration: len(0.035) }, at(0.935 + lag));
  });
  // The copy, line by line: eyebrow, the three title lines out of their masks,
  // the sentence, the button.
  tl.fromTo($("hero-copy"), { autoAlpha: 0 }, { autoAlpha: 1, duration: len(0.01) }, at(0.9));
  tl.fromTo($("hero-eyebrow"), hidden, { ...reveal, duration: len(0.05) }, at(0.9));
  tl.fromTo($("hero-line"), { yPercent: 110 }, { yPercent: 0, ease: "power3.out", duration: len(0.05), stagger: len(0.02) }, at(0.91));
  tl.fromTo($("hero-lede"), hidden, { ...reveal, duration: len(0.04) }, at(0.95));
  tl.fromTo($("hero-actions"), hidden, { ...reveal, duration: len(0.04) }, at(0.96));
  tl.to($("op-atmos"), { autoAlpha: 0, duration: len(0.1) }, at(0.86));
  tl.to($("op-skip"), { autoAlpha: 0, duration: len(0.04) }, at(0.86));
}

/** The opener under reduced motion: the same beats, each a dissolve at rest. */
function buildOpenerReduced(tl: gsap.core.Timeline, stage: HTMLElement, O: number, starsDim: HTMLElement | null) {
  const $ = picker(stage);
  const at = (p: number) => p * O;
  const len = (p: number) => p * O;
  for (const [name, p] of OPENER_LABELS) tl.addLabel(name, at(p));
  const fade = (keys: string[], inAt: number, outAt?: number) => {
    tl.fromTo($(...keys), { autoAlpha: 0 }, { autoAlpha: 1, duration: len(0.05) }, at(inAt));
    if (outAt !== undefined) tl.to($(...keys), { autoAlpha: 0, duration: len(0.05) }, at(outAt));
  };
  if (starsDim) gsap.set(starsDim, { opacity: 0.12 });
  gsap.set($("op-hand"), { rotation: 40 });
  gsap.set($("op-orb"), { scale: 0.85 });
  gsap.set($("op-globe"), { scale: 0.9 });

  tl.to($("op-cue"), { autoAlpha: 0, duration: len(0.05) }, at(0.02));
  fade(["op-core"], 0.06, 0.36);
  fade(["op-orb", "op-ticks", "op-hand"], 0.1, 0.34);
  tl.to($("op-spark"), { autoAlpha: 0, duration: len(0.05) }, at(0.3));
  fade(["op-word-1"], 0.14, 0.3);
  fade(["op-word-2"], 0.19, 0.3);
  if (starsDim) tl.fromTo(starsDim, { opacity: 0.12 }, { opacity: 1, duration: len(0.08) }, at(0.36));
  fade(["op-globe"], 0.36, 0.52);
  fade(["op-map", "op-map-glow"], 0.52, 0.72);
  // The plane appears where the hero's own plane is, and gives way to it.
  const plane = landOnHero(stage, "op-plane", ANCHORS.planeInOwn, ANCHORS.heroPlane);
  tl.set($("op-plane"), { x: plane.x, y: plane.y, scale: plane.scale, rotation: 2.6 }, at(0.71));
  fade(["op-plane"], 0.72, 0.93);
  fade(["hero-img", "hero-glow", "hero-silk", "hero-copy"], 0.86);
  tl.to($("op-atmos", "op-skip"), { autoAlpha: 0, duration: len(0.05) }, at(0.86));
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

  const O = OPENER_UNITS;
  const TOTAL = O + FILM_END;
  sizePinned(film, TOTAL, BEAT);

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
  // how far through `film` the page is and scrubs ONE master timeline: the
  // time opener first (0 -> O), then every chapter below (O -> O + FILM_END).
  // onProgress reports film time, so it is negative during the opener.
  const master = pinnedTimeline(film, TOTAL, 0.6, { onUpdate: (self) => hooks.onProgress(self.progress * TOTAL - O, self.progress) });
  // 00 THE TIME OPENER, labelled timeStart ... heroComplete on the master.
  buildOpener(master, stage, d, O, hooks.starsDim ?? null);
  // 01–11 THE FILM, nested at O so its positions read as they always did:
  // film time 0 is the hero at rest, exactly where the opener leaves it.
  const tl = gsap.timeline({ defaults: { ease: "none", immediateRender: false } });

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
    { autoAlpha: 0.6, x: X(-5, -10), y: vh(-30), rotation: -4, scale: 0.85, ease: "power1.inOut", duration: 0.9 }, 1.0);
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
  // The sky dims too: FREE owns the frame.
  if (hooks.starsDim) {
    tl.to(hooks.starsDim, { opacity: 0.3, duration: 0.6 }, 15.7);
    tl.to(hooks.starsDim, { opacity: 1, duration: 0.6 }, 18.3);
  }
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

  master.add(tl, O);
  master.addLabel("journey", O);
  return master;
}

/* =============================================================================
 * 1r. THE FILM, reduced motion — the same pinned stage, dissolves only
 * Nothing travels, scales, blurs or parallaxes: each chapter's frame fades in
 * at its resting composition and fades out for the next. All the words and
 * both calls to action are still there.
 * ============================================================================= */
export function buildFilmReduced(film: HTMLElement, stage: HTMLElement, desktop: boolean, hooks: FilmHooks) {
  const $ = picker(stage);
  const O = OPENER_REDUCED_UNITS;
  const END = FILM_REDUCED_END;
  const TOTAL = O + END;
  sizePinned(film, TOTAL, BEAT_REDUCED);

  // The route and the FREE lockup appear finished, not drawn.
  gsap.set($("route-dot", "route-end-a", "route-end-b"), { opacity: 1 });
  gsap.set($("route-head"), { opacity: 0 });
  gsap.set($("free-word", "free-glow", "free-sub-char"), { autoAlpha: 1 });
  gsap.set($("free-blur"), { autoAlpha: 0 });
  gsap.set($("inc-line"), { scaleX: 1 });

  // THE FILM'S ScrollTrigger, reduced: same stage, straight scrub, one master
  // timeline: the opener as dissolves (0 -> O), then the film (O -> O + END).
  const master = pinnedTimeline(film, TOTAL, true, { onUpdate: (self) => hooks.onProgress(self.progress * TOTAL - O, self.progress) });
  buildOpenerReduced(master, stage, O, hooks.starsDim ?? null);
  const tl = gsap.timeline({ defaults: { ease: "none", immediateRender: false } });
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
  master.add(tl, O);
  master.addLabel("journey", O);
  return master;
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
  // THE SKY'S calm ScrollTrigger: half strength behind the application, so
  // the fields read cleanly. (A change of brightness, not of position, so
  // it applies under reduced motion too.)
  const form = page.querySelector<HTMLElement>("#apply");
  const calm = $("stars-calm");
  if (form && calm.length) {
    gsap.fromTo(calm, { opacity: 1 }, { opacity: 0.45, ease: "none", scrollTrigger: { trigger: form, start: "top 75%", end: "top 25%", scrub: true, invalidateOnRefresh: true } });
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
  gsap.registerPlugin(ScrollTrigger);
}
