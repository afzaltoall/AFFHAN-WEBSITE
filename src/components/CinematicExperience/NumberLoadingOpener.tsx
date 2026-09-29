"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { COUNTER } from "./content";
import { DISPLAY } from "./parts";

/**
 * The opening count: 00 to 100 in large editorial numerals over the whole
 * screen, on every arrival (a first visit, a refresh, a link back to the
 * page), then opened from the centre like an iris onto the hero, whose own
 * entrance plays through the opening.
 *
 * It counts from the very first frame, before any script has run:
 *  - The tens and the units are reels (0 to 9 in one column) in slots that
 *    show one line, stepped by CSS keyframes generated below from the same
 *    curve the script uses, so the count keeps its pace while the page is
 *    still downloading and hydrating; there is never a frozen "00" waiting
 *    for JavaScript.
 *  - The stylesheet counts to HOLD_AT on the curve, then creeps (97, 98, 99
 *    over the next seconds) and waits. The script takes the reels over from
 *    there once the first frame's pictures and fonts are in, and finishes the
 *    same curve to 100, so the hand-over does not show. It never waits past
 *    CAP_MS; a wheel, swipe, key or click hurries it.
 *  - It never jumps backwards and never visibly stops.
 *
 * While it counts nothing underneath scrolls (a wheel or swipe hurries the
 * count instead), and the hero's CSS entrance holds its first frame
 * (data-intro="counting" on the stage; see cinematic.css).
 *
 * Under reduced motion the numbers still count (digits changing are not
 * movement); the ring holds still and the black simply fades.
 * aria-hidden, nothing focusable: it never traps a keyboard or a reader.
 * Without JavaScript it is not shown (the noscript style in page.tsx); if the
 * script never arrives, the black lets go by itself after FAILSAFE_S.
 */

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** The whole curve, 00 to 100, from the first frame (ms). */
const RUN_MS = 1800;
/** The stylesheet counts to here on the curve, then waits for the page... */
const HOLD_AT = 96;
/** ...creeping on while it waits: [number, ms after reaching HOLD_AT]. */
const CREEP: ReadonlyArray<readonly [number, number]> = [
  [97, 1200],
  [98, 3200],
  [99, 6500],
];
/** Length of the stylesheet's count; it holds 99 after this. */
const SHEET_MS = 10000;
/** However the pictures are doing, the count finishes by this (ms from the first frame). */
const CAP_MS = 2600;
/** Hurrying never makes the count shorter than this (ms from the first frame)... */
const EARLIEST_MS = 600;
/** ...and a hurried finish takes at most this long. */
const HURRY_MS = 450;
/** If the script never arrives, the black lets go by itself (s). */
const FAILSAFE_S = 20;

/**
 * Ease-in-out cubic, and the moment it first reaches a value. Plain arithmetic
 * only (no Math.pow or Math.cbrt, whose last digit may differ between engines),
 * so the keyframes the server writes are exactly the ones the browser checks.
 */
const ease = (x: number) => {
  if (x < 0.5) return 4 * x * x * x;
  const u = 2 - 2 * x;
  return 1 - (u * u * u) / 2;
};
const easeInv = (y: number) => {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (ease(mid) < y) lo = mid;
    else hi = mid;
  }
  return hi;
};
const T_HOLD = RUN_MS * easeInv(HOLD_AT / 100);

/** When the stylesheet shows each number, in ms from its start: AT[n]. */
const AT: number[] = (() => {
  const at: number[] = [];
  for (let n = 0; n <= HOLD_AT; n++) at[n] = Math.round(RUN_MS * easeInv(n / 100));
  for (const [n, after] of CREEP) at[n] = Math.round(T_HOLD) + after;
  return at;
})();
/** The number the stylesheet shows at a moment of its count. */
const sheetAt = (ms: number) => {
  let n = 0;
  while (n < 99 && AT[n + 1] <= ms) n++;
  return n;
};

/**
 * The stylesheet's half of the count: one keyframe per number, stepped.
 * Transforms, so the compositor runs them: the count keeps its pace while the
 * page is busy hydrating. Both reels share one start time, so they change in
 * the same frame.
 */
function countSheet(): string {
  const frame = (ms: number, digit: number) => `${((ms * 100) / SHEET_MS).toFixed(3)}%{transform:translateY(${-digit}em)}`;
  const units = AT.map((ms, n) => frame(ms, n % 10)).join("") + frame(SHEET_MS, 9);
  const tens = AT.flatMap((ms, n) => (n % 10 === 0 ? [frame(ms, n / 10)] : [])).join("") + frame(SHEET_MS, 9);
  return (
    `@keyframes cx-count-units{${units}}@keyframes cx-count-tens{${tens}}` +
    `.cx-count-reel[data-reel=tens]{animation:cx-count-tens ${SHEET_MS}ms steps(1,end) both}` +
    `.cx-count-reel[data-reel=units]{animation:cx-count-units ${SHEET_MS}ms steps(1,end) both}` +
    `.cx-count-ring-in{animation:cx-count-ring ${RUN_MS}ms cubic-bezier(0.65,0,0.35,1) both}` +
    `.cx-counter{animation:cx-count-failsafe .6s ease-out ${FAILSAFE_S}s forwards}` +
    `@media (prefers-reduced-motion:reduce){.cx-count-ring-in{animation:none;transform:none;opacity:.9}}`
  );
}
const COUNT_SHEET = countSheet();

const SCROLL_KEYS = new Set([" ", "Spacebar", "PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End"]);

export function NumberLoadingOpener({ onReveal }: { onReveal: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [gone, setGone] = useState(false);
  const reveal = useRef(onReveal);
  useEffect(() => {
    reveal.current = onReveal;
  }, [onReveal]);

  useIsoLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const tens = root.querySelector<HTMLElement>("[data-reel='tens']");
    const units = root.querySelector<HTMLElement>("[data-reel='units']");
    const hundred = root.querySelector<HTMLElement>("[data-count-hundred]");
    const group = root.querySelector<HTMLElement>("[data-count-group]");
    const ring = root.querySelector<HTMLElement>("[data-count-ring]");
    const numerals = root.querySelector<HTMLElement>("[data-count-numerals]");
    const caption = root.querySelector<HTMLElement>("[data-count-caption]");
    const glow = root.querySelector<HTMLElement>("[data-count-glow]");
    const sweep = root.querySelector<HTMLElement>("[data-count-sweep]");
    if (!tens || !units || !hundred || !group || !ring || !numerals || !caption || !glow || !sweep) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tweens: Array<gsap.core.Animation> = [];
    const cleanups: Array<() => void> = [];
    let raf = 0;

    // The row is GSAP's from here: two digits centred until the "1" arrives.
    gsap.set(group, { x: 0, xPercent: -100 / 6 });

    // The clock is the stylesheet's: its count started with the first frame
    // (with this element, on a visit made inside the site).
    const sheet = units.getAnimations?.().find((a) => (a as CSSAnimation).animationName === "cx-count-units");
    const t0 = typeof sheet?.startTime === "number" ? sheet.startTime : performance.now();

    // ---- What the first frame needs before the black opens -------------------------
    let heroIn = false;
    let silkIn = false;
    let fontsIn = !document.fonts;
    const stage = document.querySelector<HTMLElement>("[data-cx-stage]");
    const watch = (selector: string, done: () => void) => {
      const img = stage?.querySelector<HTMLImageElement>(selector);
      // complete: loaded, or failed (then nothing more is coming either).
      if (!img || img.complete) return done();
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
      cleanups.push(() => {
        img.removeEventListener("load", done);
        img.removeEventListener("error", done);
      });
    };
    watch("[data-cx='hero-img'] img", () => (heroIn = true));
    watch("[data-cx='hero-silk'] img", () => (silkIn = true));
    if (document.fonts) void document.fonts.ready.then(() => (fontsIn = true));

    // ---- Nothing scrolls underneath; impatience hurries the count ------------------
    let hurried = false;
    const hurry = () => {
      hurried = true;
    };
    const block = (e: Event) => {
      if (e.cancelable) e.preventDefault();
      // Capture phase on window: nothing after this sees it, Lenis included.
      e.stopPropagation();
      hurry();
    };
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (SCROLL_KEYS.has(e.key)) e.preventDefault();
      hurry();
    };
    window.addEventListener("wheel", block, { capture: true, passive: false });
    window.addEventListener("touchmove", block, { capture: true, passive: false });
    window.addEventListener("keydown", onKey, { capture: true });
    root.addEventListener("pointerdown", hurry);
    const release = () => {
      window.removeEventListener("wheel", block, { capture: true });
      window.removeEventListener("touchmove", block, { capture: true });
      window.removeEventListener("keydown", onKey, { capture: true });
      root.removeEventListener("pointerdown", hurry);
    };
    cleanups.push(release);
    const unlock = () => {
      root.removeAttribute("data-lock");
      release();
    };

    // ---- The reels ---------------------------------------------------------------
    let shown = -1;
    const show = (v: number) => {
      if (v === shown) return;
      shown = v;
      tens.style.transform = `translateY(${-(Math.floor(v / 10) % 10)}em)`;
      units.style.transform = `translateY(${-(v % 10)}em)`;
    };
    /** The number the stylesheet is showing right now. */
    const readSheet = () => {
      const digit = (el: HTMLElement) => {
        const cs = getComputedStyle(el);
        if (!cs.transform || cs.transform === "none") return 0;
        const em = parseFloat(cs.fontSize) || 1;
        return Math.min(9, Math.max(0, Math.round(-new DOMMatrixReadOnly(cs.transform).m42 / em)));
      };
      return digit(tens) * 10 + digit(units);
    };

    // ---- 100, and the opening --------------------------------------------------------
    const finale = () => {
      show(0);
      hundred.textContent = "1";
      const tl = gsap.timeline({ onComplete: () => setGone(true) });
      tweens.push(tl);
      if (reduce) {
        // 100, held long enough to read, then the black simply fades.
        gsap.set(group, { xPercent: 0 });
        tl.add(() => {
          unlock();
          reveal.current();
        }, 0.7);
        tl.to(root, { autoAlpha: 0, duration: 0.6, ease: "power1.out" }, 0.7);
        return;
      }
      // 100 ARRIVES: the "1" drops into its window as the row settles to the
      // centre, the ring takes its last turn.
      tl.to(group, { xPercent: 0, duration: 0.5, ease: "power3.out" }, 0);
      tl.fromTo(hundred, { autoAlpha: 0, yPercent: -70, filter: "blur(8px)" }, { autoAlpha: 1, yPercent: 0, filter: "blur(0px)", duration: 0.5, ease: "power3.out" }, 0);
      tl.to(ring, { rotation: "+=18", duration: 0.7, ease: "power2.out" }, 0);
      // ...AND HOLDS, LIT: the warm glow swells behind it and a band of light
      // crosses the figures (colour-dodge: it only brightens the gold).
      tl.fromTo(glow, { autoAlpha: 0, scale: 0.7 }, { autoAlpha: 0.95, scale: 1, duration: 0.55, ease: "power2.out" }, 0.08);
      tl.fromTo(sweep, { xPercent: -130, autoAlpha: 1 }, { xPercent: 330, duration: 0.75, ease: "power2.inOut" }, 0.38);
      tl.set(sweep, { autoAlpha: 0 }, 1.13);
      // THEN IT OPENS: the ring flares outwards, the figures lift and blur,
      // and the black opens from the centre behind them, onto the hero.
      const OPEN = 1.1;
      tl.to(caption, { autoAlpha: 0, duration: 0.3 }, OPEN - 0.2);
      tl.to(ring, { scale: 3, opacity: 0, duration: 0.95, ease: "power2.in" }, OPEN - 0.1);
      tl.to(glow, { autoAlpha: 0, scale: 1.6, duration: 0.7, ease: "power2.in" }, OPEN);
      tl.to(numerals, { scale: 1.08, autoAlpha: 0, filter: "blur(12px)", duration: 0.6, ease: "power2.in" }, OPEN);
      tl.fromTo(root, { "--hole": "-18vmax" }, { "--hole": "150vmax", duration: 1.1, ease: "power2.inOut" }, OPEN);
      tl.add(() => {
        unlock();
        reveal.current();
      }, OPEN + 0.1);
    };

    /** Take the reels over from the stylesheet and finish its curve to 100. */
    const finish = (now: number) => {
      // The compositor can be a frame or two ahead of what this thread reads;
      // take the later of the two, so the hand-over never steps backwards.
      const v0 = Math.min(99, Math.max(readSheet(), sheet ? sheetAt(now - t0 + 34) : 0));
      tens.style.animation = "none";
      units.style.animation = "none";
      show(v0);
      const x0 = easeInv(v0 / 100);
      const natural = (1 - x0) * RUN_MS;
      const dur = Math.max(140, hurried ? Math.min(HURRY_MS, natural) : natural);
      const run = (n: number) => {
        const p = Math.min(1, (n - now) / dur);
        if (p >= 1) return finale();
        show(Math.max(v0, Math.min(99, Math.floor(100 * ease(x0 + (1 - x0) * p) + 1e-9))));
        raf = requestAnimationFrame(run);
      };
      raf = requestAnimationFrame(run);
    };

    const wait = (now: number) => {
      const t = now - t0;
      const ready = heroIn && silkIn && fontsIn;
      if (t >= EARLIEST_MS && (hurried || t >= CAP_MS || (ready && t >= T_HOLD))) return finish(now);
      raf = requestAnimationFrame(wait);
    };
    raf = requestAnimationFrame(wait);

    return () => {
      cancelAnimationFrame(raf);
      tweens.forEach((t) => t.kill());
      cleanups.forEach((fn) => fn());
    };
  }, []);

  if (gone) return null;

  return (
    <div
      ref={rootRef}
      data-cx-counter
      data-lock=""
      aria-hidden
      className="cx-counter fixed inset-0 z-[200] flex select-none items-center justify-center overflow-hidden"
    >
      <style dangerouslySetInnerHTML={{ __html: COUNT_SHEET }} />
      <div className="cx-grain pointer-events-none absolute inset-0" />
      <div className="cx-vignette pointer-events-none absolute inset-0" />

      {/* One thin gold ring, tightening and turning as the count climbs. */}
      <div data-count-ring className="pointer-events-none absolute aspect-square w-[min(66vh,86vw)]">
        <div className="cx-count-ring-in h-full w-full">
          <svg viewBox="-100 -100 200 200" className="h-full w-full overflow-visible">
            <defs>
              <linearGradient id="cx-count-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#d6a84e" stopOpacity="0.12" />
                <stop offset="0.6" stopColor="#d6a84e" stopOpacity="0.5" />
                <stop offset="0.86" stopColor="#fff4d6" stopOpacity="0.95" />
                <stop offset="1" stopColor="#f2d38e" stopOpacity="0.35" />
              </linearGradient>
            </defs>
            <circle r="96" fill="none" stroke="url(#cx-count-ring)" strokeWidth="0.45" />
            <circle r="99.5" fill="none" stroke="#d6a84e" strokeOpacity="0.12" strokeWidth="0.25" />
            {[0, 90, 180, 270].map((a) => (
              <line key={a} x1="0" y1="-92.5" x2="0" y2="-96" stroke="#f2d38e" strokeOpacity="0.7" strokeWidth="0.5" transform={`rotate(${a})`} />
            ))}
          </svg>
        </div>
      </div>

      {/* The warm light the numerals flare into at 100. */}
      <div data-count-glow className="cx-glow-gold pointer-events-none absolute h-[46vmin] w-[86vmin] opacity-0" />

      {/* The numerals: three fixed-width slots, so nothing shifts as they change. */}
      <div data-count-numerals className={`${DISPLAY} cx-count-num relative`}>
        {/* The light that crosses 100 as it holds (colour-dodge: black stays black). */}
        <span data-count-sweep aria-hidden className="cx-sweep pointer-events-none absolute inset-y-[-12%] left-0 z-10 w-[42%] opacity-0" />
        <div className="cx-count-enter">
          <span data-count-group className="cx-count-group">
            <span data-count-hundred className="cx-count-slot cx-count-ink" />
            <span className="cx-count-slot">
              <span data-reel="tens" className="cx-count-reel" />
            </span>
            <span className="cx-count-slot">
              <span data-reel="units" className="cx-count-reel" />
            </span>
          </span>
        </div>
      </div>

      <p
        data-count-caption
        className="absolute inset-x-0 bottom-[8svh] text-center text-[11px] font-semibold uppercase tracking-[0.42em] text-(--cx-gold)"
      >
        <span className="cx-count-enter cx-count-enter-late inline-block">{COUNTER.caption}</span>
      </p>

      {/* On top of everything, invisible: a scroller a hair taller than the
          screen with its overscroll contained, so a wheel or swipe made before
          the script arrives stops here instead of scrolling the page below.
          Only this empty layer moves (2px), never the count. */}
      <div className="cx-count-trap absolute inset-0">
        <div className="h-[calc(100%+2px)]" />
      </div>
    </div>
  );
}
