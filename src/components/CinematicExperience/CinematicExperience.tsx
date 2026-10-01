"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import "./cinematic.css";
import {
  buildCta,
  buildFilm,
  buildFilmReduced,
  buildStars,
  buildSteps,
  buildTerms,
  FILM_CHAPTER_STARTS,
  FILM_REDUCED_STARTS,
  registerGsap,
} from "./animations";
import { APPLY_HREF, CHAPTERS, INCLUDED, INCLUDED_EYEBROW } from "./content";
import { FilmHud } from "./FilmHud";
import { Motifs } from "./Motifs";
import { NumberLoadingOpener } from "./NumberLoadingOpener";
import { GatherField } from "./particles";
import { Scene01Opening } from "./Scene01Opening";
import { Scene02Passport } from "./Scene02Passport";
import { Scene03BoardingPass } from "./Scene03BoardingPass";
import { Scene04Airplane } from "./Scene04Airplane";
import { Scene05Globe } from "./Scene05Globe";
import { Scene06ChinaMap } from "./Scene06ChinaMap";
import { Scene07CityJourney } from "./Scene07CityJourney";
import { Scene08FoshanArrival } from "./Scene08FoshanArrival";
import { Scene09Hotel } from "./Scene09Hotel";
import { Scene10FreeReveal } from "./Scene10FreeReveal";
import { Scene11WhatsIncluded } from "./Scene11WhatsIncluded";
import { Scene12HowItWorks } from "./Scene12HowItWorks";
import { Scene13Terms } from "./Scene13Terms";
import { Scene14FinalCta } from "./Scene14FinalCta";
import { Starfield } from "./Starfield";
import { ARRIVAL_KEY, takeOff } from "./takeoff";
import { TakeOffLayer } from "./TakeOffLayer";
import { revertTextFx } from "./textfx";
import { WarpField } from "./warp";
import { WarpToFoshan } from "./WarpToFoshan";

/**
 * The free China business trip, as one scroll-driven film.
 *
 * Page order: the film (a pinned stage, chapters 01–11) -> How it works ->
 * Terms & Conditions -> the final call to action (a second pinned stage,
 * 14–16: the call, then into time, then the countdown, all in the one
 * stage) -> the end of the page: no footer. Every "Apply
 * for the Trip" opens the application, its own page (/free-china-trip/apply/),
 * through goApply's transition. It mounts below
 * the site's navbar, which it does not touch: the page is padded 64px for
 * the fixed bar (app/free-china-trip/page.tsx), exactly as other pages are.
 *
 * This file wires things together and owns no choreography:
 *  - builds the timelines in animations.ts inside gsap.matchMedia, so crossing
 *    the phone/desktop breakpoint or switching reduced motion on or off
 *    rebuilds them cleanly;
 *  - runs Lenis (smooth wheel scrolling) for this page only, driven from
 *    GSAP's ticker so scroll and scrub move in the same frame, and never for
 *    anyone who asked for reduced motion;
 *  - feeds the pictures in, in the order the film needs them (see parts.tsx);
 *  - keeps the chapter readout current.
 */

const SCROLL_BEHAVIOR_CLASS = "scroll-behavior-auto";
/** data-cx-scene names, in chapter order (matches CHAPTERS). */
const SCENE_ORDER = ["opening", "passport", "boarding", "plane", "globe", "map", "cities", "foshan", "hotel", "free", "included"];

function promote(img: HTMLImageElement) {
  const src = img.dataset.src;
  if (!src) return;
  if (img.dataset.sizes) img.sizes = img.dataset.sizes;
  if (img.dataset.srcset) img.srcset = img.dataset.srcset;
  img.src = src;
  delete img.dataset.src;
  delete img.dataset.srcset;
  delete img.dataset.sizes;
}

/**
 * Pictures after the opening frame load once the page has, two at a time, in
 * page order (which is film order), each decoded before the next pair so a
 * chapter never arrives with a half-painted image. A chapter the reader is
 * about to reach jumps the queue.
 */
function startLoader(root: HTMLElement) {
  let cancelled = false;
  const run = async () => {
    while (!cancelled) {
      const next = Array.from(root.querySelectorAll<HTMLImageElement>("img[data-src]")).slice(0, 2);
      if (!next.length) return;
      next.forEach(promote);
      await Promise.all(next.map((img) => img.decode().catch(() => undefined)));
    }
  };
  const kick = () => {
    root.dataset.cxReady = "";
    if ("requestIdleCallback" in window) window.requestIdleCallback(() => void run(), { timeout: 2500 });
    else setTimeout(() => void run(), 600);
  };
  if (document.readyState === "complete") kick();
  else window.addEventListener("load", kick, { once: true });
  return {
    prioritise(scene: string | undefined) {
      if (!scene) return;
      root.querySelectorAll<HTMLImageElement>(`[data-cx-scene="${scene}"] img[data-src]`).forEach(promote);
    },
    cancel() {
      cancelled = true;
      window.removeEventListener("load", kick);
    },
  };
}

export function CinematicExperience() {
  const rootRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);
  // The opening count holds the hero's entrance until it opens onto it.
  const [intro, setIntro] = useState<"counting" | "done">("counting");
  const onReveal = useCallback(() => setIntro("done"), []);

  // The site scrolls smoothly by default (globals.css). Lenis needs that off,
  // and so does reduced motion, where an anchor jump should simply jump.
  // (Scroll restoration is handled with the timelines, below.)
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add(SCROLL_BEHAVIOR_CLASS);
    return () => html.classList.remove(SCROLL_BEHAVIOR_CLASS);
  }, []);

  const router = useRouter();
  const leaving = useRef(false);

  // The application is one click away from anywhere on the page: have it
  // ready. Old links to the in-page form (…/free-china-trip/#apply) now open
  // the application itself.
  useEffect(() => {
    router.prefetch(APPLY_HREF);
    if (window.location.hash === "#apply") router.replace(APPLY_HREF);
  }, [router]);

  /**
   * Every "Apply for the Trip" (hero, film readout, final call, countdown):
   * the trip takes off from the button pressed (takeoff.ts: the plane leaves
   * its porthole, draws a gold contrail up and out of the top right corner,
   * and light blooms where it leaves), and the application opens out of that
   * same light: ARRIVAL_KEY tells it to start from this frame. Transform,
   * opacity and a stroke's dash only. The navbar stays. Ctrl, ⌘, Shift or
   * middle click still open a new tab, as links do.
   */
  const goApply = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (leaving.current) return;
      leaving.current = true;
      lenisRef.current?.stop();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const go = () => {
        if (!reduced) {
          try {
            sessionStorage.setItem(ARRIVAL_KEY, String(Date.now()));
          } catch {
            /* the application simply opens from dark */
          }
        }
        router.push(APPLY_HREF);
      };
      const layer = rootRef.current?.querySelector<HTMLElement>("[data-cx='exit']");
      if (!layer) return go();
      takeOff(e.currentTarget, layer, reduced, go);
    },
    [router],
  );

  useGSAP(
    () => {
      registerGsap();
      // A refresh reopens the film at its first frame. The film only gets its
      // full length from script, so a restored scroll position would land in
      // the one-screen server render (on the countdown) and then jump.
      // history.scrollRestoration is stored on the history entry, so setting
      // it here is already in force when this entry is refreshed. It is set
      // through ScrollTrigger, not directly: ScrollTrigger remembers the value
      // it first saw and writes it back after every refresh, so a direct
      // "manual" lasted only until the timelines refreshed. "auto" again on
      // the way out, for every other page.
      ScrollTrigger.clearScrollMemory("manual");
      const root = rootRef.current;
      if (!root) return;
      const film = root.querySelector<HTMLElement>("[data-cx-film]");
      const stage = root.querySelector<HTMLElement>("[data-cx-stage]");
      const steps = root.querySelector<HTMLElement>("[data-cx-steps]");
      const terms = root.querySelector<HTMLElement>("[data-cx-terms]");
      const cta = root.querySelector<HTMLElement>("[data-cx-cta]");
      const ctaStage = root.querySelector<HTMLElement>("[data-cx-cta-stage]");
      if (!film || !stage || !steps || !cta || !ctaStage) return;

      const loader = startLoader(root);

      // The final stage's pictures, as it comes within a screen and a half.
      const near = new IntersectionObserver(
        ([e]) => {
          if (!e.isIntersecting) return;
          cta.querySelectorAll<HTMLImageElement>("img[data-src]").forEach(promote);
          near.disconnect();
        },
        { rootMargin: "150% 0px" },
      );
      near.observe(cta);

      // The chapter readout, written only when the chapter changes.
      const hudNum = stage.querySelector<HTMLElement>("[data-cx='hud-num']");
      const hudName = stage.querySelector<HTMLElement>("[data-cx='hud-name']");
      const hudBar = stage.querySelector<HTMLElement>("[data-cx='hud-bar']");
      const setBar = hudBar ? gsap.quickSetter(hudBar, "scaleX") : () => undefined;

      const mm = gsap.matchMedia();
      // gsap.matchMedia runs this only while at least one query matches, so
      // desktop and phone are both named: one of the two is always true.
      // short: How it works is only pinned on screens tall enough to hold it.
      // squat: a landscape phone (under 540px tall), which gets its own
      // arrangement of the hero, the included rows and the countdown
      // (cinematic.css) and a smaller, higher FREE lockup (animations.ts).
      mm.add({ desktop: "(min-width: 768px)", phone: "(max-width: 767.98px)", reduce: "(prefers-reduced-motion: reduce)", short: "(max-height: 620px)", squat: "(max-height: 540px) and (orientation: landscape)" }, (ctx) => {
        const { desktop, reduce, short, squat } = ctx.conditions as { desktop: boolean; reduce: boolean; short: boolean; squat: boolean };
        const starts = reduce ? FILM_REDUCED_STARTS : FILM_CHAPTER_STARTS;
        let chapter = -1;
        const onProgress = (time: number, progress: number) => {
          setBar(progress);
          let i = starts.length - 1;
          while (i > 0 && time < starts[i]) i--;
          if (i === chapter) return;
          chapter = i;
          if (hudNum) hudNum.textContent = String(i + 1).padStart(2, "0");
          if (hudName) hudName.textContent = CHAPTERS[i];
          loader.prioritise(SCENE_ORDER[i]);
          loader.prioritise(SCENE_ORDER[i + 1]);
          loader.prioritise(SCENE_ORDER[i + 2]);
        };

        // Smooth wheel scrolling, for this page and only with motion allowed.
        let lenis: Lenis | null = null;
        let tick: ((time: number) => void) | null = null;
        if (!reduce) {
          lenis = new Lenis({ autoRaf: false, allowNestedScroll: true, wheelMultiplier: 0.9, lerp: 0.1 });
          lenisRef.current = lenis;
          // src/lib/scroll.ts routes the site's own scrollToId() through this.
          (window as unknown as { lenis?: Lenis }).lenis = lenis;
          lenis.on("scroll", ScrollTrigger.update);
          const l = lenis;
          tick = (time: number) => l.raf(time * 1000);
          gsap.ticker.add(tick);
        }

        // The FREE particles sample the word's real shape; resample on refresh.
        let particles: GatherField | null = null;
        const canvas = stage.querySelector<HTMLCanvasElement>("[data-cx='free-particles']");
        const word = stage.querySelector<HTMLElement>("[data-cx='free-word']");
        if (!reduce && canvas && word) {
          particles = new GatherField(canvas, word, desktop ? 2400 : 1100);
          void particles.layout();
        }
        // The jump to Foshan: gold streaks drawn from the film's progress.
        const warpCanvas = stage.querySelector<HTMLCanvasElement>("[data-cx='warp']");
        const warp = !reduce && warpCanvas ? new WarpField(warpCanvas, desktop ? 420 : 220) : null;
        warp?.layout();
        const relayout = () => {
          void particles?.layout();
          warp?.layout();
        };
        ScrollTrigger.addEventListener("refresh", relayout);

        const stars = root.querySelector<HTMLElement>("[data-cx='stars']");
        const starsDim = root.querySelector<HTMLElement>("[data-cx='stars-dim']");
        if (stars) buildStars(root, stars, reduce);
        if (reduce) buildFilmReduced(film, stage, desktop, { onProgress, squat });
        else buildFilm(film, stage, desktop, particles, { onProgress, starsDim, squat, warp: warp ? (p) => warp.render(p) : undefined });
        const undoSteps = buildSteps(steps, desktop, reduce, short);
        const undoTerms = terms ? buildTerms(terms, reduce) : () => undefined;
        buildCta(cta, ctaStage, desktop, reduce, starsDim);

        // The site's floating dock (WhatsAppButton: back to top, Instagram)
        // sits bottom right, which on a phone is on top of the film's city
        // names and its HUD. It steps aside while the film holds the screen
        // (cinematic.css) and comes back for the sections after it.
        const root_ = document.documentElement;
        const dock = ScrollTrigger.create({
          trigger: film,
          start: "top top",
          end: "bottom bottom",
          onToggle: (self) => root_.toggleAttribute("data-film-on", self.isActive),
        });

        ScrollTrigger.refresh();
        root_.toggleAttribute("data-film-on", dock.isActive);
        // Web fonts change the height of the text sections, and so where the
        // later triggers start.
        void document.fonts?.ready.then(() => ScrollTrigger.refresh());

        return () => {
          ScrollTrigger.removeEventListener("refresh", relayout);
          root_.removeAttribute("data-film-on");
          particles?.clear();
          warp?.clear();
          undoSteps();
          undoTerms();
          revertTextFx();
          if (tick) gsap.ticker.remove(tick);
          lenis?.destroy();
          lenisRef.current = null;
          delete (window as unknown as { lenis?: Lenis }).lenis;
          film.style.height = "";
          cta.style.height = "";
        };
      });

      return () => {
        near.disconnect();
        loader.cancel();
        mm.revert();
        ScrollTrigger.clearScrollMemory("auto");
      };
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef}>
      {/* The opening count: fixed over the whole screen, and first in the
          document so it is in the very first paint of every load. */}
      <NumberLoadingOpener onReveal={onReveal} />

      {/* The way out to the application (goApply, takeoff.ts). */}
      <TakeOffLayer />

      {/* The night sky, behind every section below (fixed; see Starfield.tsx). */}
      <Starfield />

      {/* THE FILM: a sticky stage inside a section as tall as the scroll (set by
          animations.ts). Server-rendered as one screen: the opening frame. */}
      <section data-cx-film aria-label="The journey" className="relative h-[100svh]">
        <div data-cx-stage data-intro={intro} className="sticky top-0 h-[100svh] overflow-hidden">
          <Motifs />
          <Scene01Opening onApply={goApply} play={intro === "done"} />
          <Scene02Passport />
          <Scene03BoardingPass />
          <Scene04Airplane />
          <Scene05Globe />
          <Scene06ChinaMap />
          <Scene07CityJourney />
          <WarpToFoshan />
          <Scene08FoshanArrival />
          <Scene09Hotel />
          <Scene10FreeReveal />
          <Scene11WhatsIncluded />
          <FilmHud onSkip={goApply} />
        </div>
      </section>

      {/* Without JavaScript the film cannot play, so its one list of facts is
          given plainly. */}
      <noscript>
        <section className="mx-auto max-w-[920px] px-6 py-20">
          <p className="text-[12px] font-semibold uppercase tracking-[0.3em] text-(--cx-gold)">{INCLUDED_EYEBROW}</p>
          <ul className="mt-6 grid gap-4">
            {INCLUDED.map((item) => (
              <li key={item.title} className="border-t border-(--cx-faint) pt-4">
                <h3 className="text-[22px]">{item.title}</h3>
                <p className="text-(--cx-mute)">{item.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      </noscript>

      <Scene12HowItWorks />
      <Scene13Terms />
      <div data-cx-scene="cta">
        <Scene14FinalCta onApply={goApply} />
      </div>
    </div>
  );
}
