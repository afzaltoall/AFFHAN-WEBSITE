"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { COUNTER } from "./content";
import { DISPLAY } from "./parts";

/**
 * The opening count: 00 to 100 in large editorial numerals, played by itself
 * the moment the page loads (no scroll), then opened from the centre like an
 * iris onto the hero, whose own entrance plays through the opening.
 *
 * Load-driven, not scroll-driven, and kept apart from every ScrollTrigger:
 *  - The number follows what the first frame really needs (the hero picture,
 *    its silk, the fonts, the page's load event) but on a cinematic clock: it
 *    takes at least MIN_MS, eases in and out, and never waits past CAP_MS
 *    whatever the network is doing; the pictures carry on loading behind.
 *  - It never jumps and never visibly stops: it follows its target smoothly
 *    and never moves slower than CRAWL.
 *  - Digits change with a short blur-in, not a flip: no odometer, no bounce.
 *  - One thin gold ring tightens and turns as it climbs. It is not a progress
 *    bar: nothing fills. At 100 it flares and opens outwards, and the black
 *    opens behind it (a radial mask), so the hero appears through the ring.
 *  - Once per session (sessionStorage). Scrolling, a click or a key hurries it
 *    to 100. Under reduced motion there is no count at all, only a fade.
 *  - aria-hidden, nothing focusable: it never traps a keyboard or a reader.
 *
 * The server paints "00" in the first frame, so the page opens on the count
 * rather than flashing the hero first. Until onReveal the hero's CSS entrance
 * waits (data-intro="counting" on the stage; see cinematic.css).
 */

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Seen once in this tab's session: never again until the session ends. */
const SEEN_KEY = "affhan:trip-count";
/** From navigation start: at least this long, and never longer than CAP_MS. */
const MIN_MS = 1800;
const CAP_MS = 2500;
/** If the page took long to become interactive, still count for at least this long. */
const MIN_COUNT_MS = 1000;
const CAP_COUNT_MS = 1300;
/** Never slower than this share of the count per second: a stall never shows. */
const CRAWL = 0.14;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

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
    const digits = Array.from(root.querySelectorAll<HTMLElement>("[data-digit]"));
    const group = root.querySelector<HTMLElement>("[data-count-group]");
    const ring = root.querySelector<HTMLElement>("[data-count-ring]");
    const numerals = root.querySelector<HTMLElement>("[data-count-numerals]");
    const caption = root.querySelector<HTMLElement>("[data-count-caption]");
    const glow = root.querySelector<HTMLElement>("[data-count-glow]");
    if (digits.length !== 3 || !group || !ring || !numerals || !caption || !glow) return;

    const tweens: Array<gsap.core.Animation> = [];
    const cleanups: Array<() => void> = [];
    let raf = 0;

    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* storage blocked: count as a first visit */
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Already seen this session, or reduced motion: no count, only a fade.
    if (seen || reduce) {
      reveal.current();
      tweens.push(gsap.to(root, { autoAlpha: 0, duration: reduce ? 0.5 : 0.35, ease: "power1.out", onComplete: () => setGone(true) }));
      return () => tweens.forEach((t) => t.kill());
    }

    // ---- What the first frame really waits for --------------------------------
    const parts = { hero: 0, silk: 0, fonts: 0, load: 0 };
    let real = 0;
    const recompute = () => {
      real = parts.hero * 0.4 + parts.silk * 0.1 + parts.fonts * 0.2 + parts.load * 0.3;
    };
    const stage = root.closest<HTMLElement>("[data-cx-stage]");
    const watch = (selector: string, key: "hero" | "silk") => {
      const img = stage?.querySelector<HTMLImageElement>(selector);
      if (!img || (img.complete && img.naturalWidth > 0)) {
        parts[key] = 1;
        return;
      }
      const onDone = () => {
        parts[key] = 1;
        recompute();
      };
      img.addEventListener("load", onDone, { once: true });
      img.addEventListener("error", onDone, { once: true });
      cleanups.push(() => {
        img.removeEventListener("load", onDone);
        img.removeEventListener("error", onDone);
      });
    };
    watch("[data-cx='hero-img'] img", "hero");
    watch("[data-cx='hero-silk'] img", "silk");
    if (document.fonts) {
      void document.fonts.ready.then(() => {
        parts.fonts = 1;
        recompute();
      });
    } else parts.fonts = 1;
    if (document.readyState === "complete") parts.load = 1;
    else {
      const onLoad = () => {
        parts.load = 1;
        recompute();
      };
      window.addEventListener("load", onLoad, { once: true });
      cleanups.push(() => window.removeEventListener("load", onLoad));
    }
    recompute();

    // ---- The clock ----------------------------------------------------------------
    // On a fresh load "00" has been on screen since the first paint, so the
    // minimum and the cap count from navigation start; arriving later in a
    // session (a client-side visit), they count from now.
    const now0 = performance.now();
    const origin = now0 < 4000 ? 0 : now0;
    const minEnd = Math.max(origin + MIN_MS, now0 + MIN_COUNT_MS);
    const capEnd = Math.max(origin + CAP_MS, now0 + CAP_COUNT_MS);
    let shown = 0;
    let value = 0;
    let last = now0;
    let hurry = 0;
    let finished = false;
    const blurIns: Array<Animation | null> = [null, null, null];

    const render = (v: number) => {
      if (v === value) return;
      value = v;
      // Two digits until 100; the "1" is brought in by the finale.
      const chars = v >= 100 ? ["", "0", "0"] : ["", String(Math.floor(v / 10)), String(v % 10)];
      chars.forEach((ch, i) => {
        const el = digits[i];
        if (el.textContent === ch) return;
        el.textContent = ch;
        if (!ch) return;
        blurIns[i]?.cancel();
        blurIns[i] = el.animate(
          [
            { opacity: 0.35, filter: "blur(3px)" },
            { opacity: 1, filter: "blur(0px)" },
          ],
          { duration: 170, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
      });
    };

    const finish = () => {
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* nothing to remember with */
      }
      digits[0].textContent = "1";
      const tl = gsap.timeline({ onComplete: () => setGone(true) });
      // 100: the "1" resolves on the left as the group settles to centre.
      tl.to(group, { xPercent: 0, duration: 0.42, ease: "power3.out" }, 0);
      tl.fromTo(digits[0], { autoAlpha: 0, filter: "blur(6px)" }, { autoAlpha: 1, filter: "blur(0px)", duration: 0.42, ease: "power2.out" }, 0);
      tl.fromTo(glow, { autoAlpha: 0, scale: 0.7 }, { autoAlpha: 0.9, scale: 1, duration: 0.4, ease: "power2.out" }, 0.06);
      tl.to(glow, { autoAlpha: 0, scale: 1.6, duration: 0.7, ease: "power2.in" }, 0.55);
      // The ring draws true, flares, and opens outwards...
      tl.to(ring, { scale: 1, rotation: "+=14", opacity: 1, duration: 0.38, ease: "power2.out" }, 0);
      tl.to(ring, { scale: 3, opacity: 0, duration: 0.95, ease: "power2.in" }, 0.52);
      tl.to(caption, { autoAlpha: 0, duration: 0.3 }, 0.46);
      tl.to(numerals, { scale: 1.1, autoAlpha: 0, filter: "blur(12px)", duration: 0.6, ease: "power2.in" }, 0.6);
      // ...and the black opens from the centre behind it, onto the hero.
      tl.fromTo(root, { "--hole": "-18vmax" }, { "--hole": "150vmax", duration: 1.15, ease: "power2.inOut" }, 0.62);
      tl.add(() => reveal.current(), 0.72);
      tweens.push(tl);
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const timeP = easeInOut(clamp01((now - now0) / (minEnd - now0)));
      const capP = clamp01((now - now0) / (capEnd - now0));
      let target = Math.max(Math.min(timeP, real), capP);
      if (hurry) target = Math.max(target, clamp01((now - hurry) / 420));
      const follow = (target - shown) * (1 - Math.exp(-dt * 9));
      shown = Math.min(1, shown + Math.max(follow, CRAWL * dt));
      if (now >= capEnd + 220 || (hurry && now >= hurry + 520)) shown = 1;
      render(Math.min(100, Math.floor(shown * 100 + 1e-6)));
      // The ring tightens and turns with the count; nothing fills.
      ring.style.transform = `scale(${(1.26 - 0.26 * shown).toFixed(4)}) rotate(${(shown * 110).toFixed(2)}deg)`;
      ring.style.opacity = (0.45 + 0.55 * shown).toFixed(3);
      if (shown >= 1) {
        finished = true;
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Any sign of impatience hurries it to 100.
    const onHurry = () => {
      if (!hurry && !finished) hurry = performance.now();
    };
    root.addEventListener("pointerdown", onHurry);
    window.addEventListener("wheel", onHurry, { passive: true });
    window.addEventListener("touchstart", onHurry, { passive: true });
    window.addEventListener("keydown", onHurry);
    cleanups.push(() => {
      root.removeEventListener("pointerdown", onHurry);
      window.removeEventListener("wheel", onHurry);
      window.removeEventListener("touchstart", onHurry);
      window.removeEventListener("keydown", onHurry);
    });

    return () => {
      cancelAnimationFrame(raf);
      blurIns.forEach((a) => a?.cancel());
      tweens.forEach((t) => t.kill());
      cleanups.forEach((fn) => fn());
    };
  }, []);

  if (gone) return null;

  return (
    <div
      ref={rootRef}
      data-cx-counter
      aria-hidden
      className="cx-counter absolute inset-0 z-[95] flex select-none items-center justify-center overflow-hidden"
    >
      <div aria-hidden className="cx-grain pointer-events-none absolute inset-0" />
      <div aria-hidden className="cx-vignette pointer-events-none absolute inset-0" />

      {/* One thin gold ring, tightening and turning as the count climbs. */}
      <div data-count-ring className="pointer-events-none absolute aspect-square w-[min(66vh,86vw)]" style={{ transform: "scale(1.26)", opacity: 0.45 }}>
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

      {/* The warm light the numerals flare into at 100. */}
      <div data-count-glow className="cx-glow-gold pointer-events-none absolute h-[46vmin] w-[86vmin] opacity-0" />

      {/* The numerals: three fixed-width slots, so nothing shifts as they change. */}
      <div data-count-numerals className={`${DISPLAY} cx-count-num relative`}>
        <span data-count-group className="inline-flex" style={{ transform: "translateX(-16.667%)" }}>
          <span data-digit className="cx-count-slot" />
          <span data-digit className="cx-count-slot">0</span>
          <span data-digit className="cx-count-slot">0</span>
        </span>
      </div>

      <p data-count-caption className="absolute inset-x-0 bottom-[8svh] text-center text-[10px] font-semibold uppercase tracking-[0.42em] text-(--cx-gold) md:text-[11px]">
        {COUNTER.caption}
      </p>
    </div>
  );
}
