"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

/**
 * Smooth wheel scrolling for /careers/, and only /careers/.
 *
 * The page is told by scrolling — a scrubbed video hero, the teams wall and
 * the pinned growth flow — and native wheel scrolling moves it in stop-start
 * steps: each notch lands as its own short ease. Measured with real
 * wheel-gesture input, 10–33% of frames showed no movement while the wheel was
 * turning; with Lenis, 1%. It costs a little latency (about 20–60ms at speed),
 * which is the glide.
 *
 * Lenis was removed from this page once already, in growth-flow.tsx, on the
 * theory that main-thread scrolling would stutter. Measured again at 6× CPU
 * throttling, it did not: frames over 50ms were no more frequent than native.
 * It now lives here, owned by the page instead of by one of its sections.
 *
 * - Speed. Each notch moves WHEEL_MULTIPLIER of its native distance. The pinned
 *   stages are long, and at full distance a quick spin crossed the growth flow
 *   in under a second and a half.
 * - scroll-behavior. The page opts out of the global
 *   `html { scroll-behavior: smooth }` whether or not Lenis runs — that setting
 *   is what left the page feeling stuck once Lenis was gone. It is a class with
 *   an !important rule (globals.css), not an inline style, because ScrollTrigger
 *   writes `scroll-behavior: smooth` back inline after every refresh if it first
 *   met the scroller on a smooth-scrolling page, and /shipping/ runs
 *   ScrollTriggers too.
 * - Nested scrolling. By default Lenis swallows every wheel event, so a panel
 *   opened over the page — the All Categories menu, the search suggestions —
 *   scrolled the page behind it instead of itself. allowNestedScroll hands the
 *   wheel back to any element that can still scroll that way.
 * - Driven from gsap.ticker, so Lenis and the scroll-scrubbed timelines update in
 *   the same frame. GSAP's default lag smoothing stays on.
 * - Destroyed on unmount, so client-side navigation away leaves every other page
 *   on native scrolling. Nobody who asked for reduced motion gets it, and touch
 *   stays native (Lenis leaves touch alone unless syncTouch is set).
 */

/** Share of the native per-notch distance. 1 is native; lower is slower. */
const WHEEL_MULTIPLIER = 0.7;

/** Toggled on <html>; globals.css turns it into `scroll-behavior: auto !important`. */
const SCROLL_BEHAVIOR_CLASS = "scroll-behavior-auto";

export function CareersSmoothScroll() {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add(SCROLL_BEHAVIOR_CLASS);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return () => html.classList.remove(SCROLL_BEHAVIOR_CLASS);
    }

    gsap.registerPlugin(ScrollTrigger);
    const lenis = new Lenis({
      autoRaf: false,
      wheelMultiplier: WHEEL_MULTIPLIER,
      allowNestedScroll: true,
    });
    // src/lib/scroll.ts routes the in-page "open roles" buttons through this.
    const w = window as unknown as { lenis?: Lenis };
    w.lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      delete w.lenis;
      html.classList.remove(SCROLL_BEHAVIOR_CLASS);
    };
  }, []);

  return null;
}

export default CareersSmoothScroll;
