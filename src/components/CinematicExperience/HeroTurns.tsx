"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { HERO } from "./content";

/**
 * The headline's turns. Under FREE, the second and third lines take turns
 * through what the offer covers, in HERO.line's own words (HERO.turns):
 * BUSINESS TRIP, ROUND-TRIP FLIGHT, HOTEL STAY, LOCAL TRANSPORT, and round.
 *
 * At each turn FREE catches the light first; then the old words' letters
 * lift out of their lines, one after another, and the new ones rise in,
 * landing in gold and cooling to white, while a streak of light crosses the
 * words. Every letter is masked by its line, so nothing ever overlaps.
 *
 * Time-based and polite: it starts once the opening count has opened onto
 * the frame, turns only while the headline is on screen and the tab is
 * visible, skips any pair too wide for its line, and never runs under
 * reduced motion (the first pair simply stays). Decorative: the <h1> reads
 * HERO.titleLines (sr-only, in Scene01Opening), so search and screen
 * readers get one stable title.
 */
const FIRST = 2.4; // seconds after the reveal before the first turn
const HOLD = 2.6; // seconds each pair rests between turns
const GOLD = "#f2d38e";

export function HeroTurns({ play }: { play: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!play || !root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const copy = root.closest<HTMLElement>("[data-cx='hero-copy']");
    const lines = Array.from(root.querySelectorAll<HTMLElement>("[data-turn-line]"));
    const alt = (line: HTMLElement, k: number) => line.children[k] as HTMLElement;
    const letters = (el: HTMLElement) => Array.from(el.children) as HTMLElement[];
    const sweep = root.querySelector<HTMLElement>("[data-turn-sweep]");
    const flare = root.querySelector<HTMLElement>("[data-turn-flare]");
    const ink = getComputedStyle(lines[0]).color;
    const n = HERO.turns.length;
    let cur = 0;
    let wait: gsap.core.Tween | null = null;
    let tl: gsap.core.Timeline | null = null;

    // A pair fits if each of its words is no wider than its line.
    const fits = (k: number) =>
      lines.every((line) => {
        const ls = letters(alt(line, k));
        const w = ls[ls.length - 1].getBoundingClientRect().right - ls[0].getBoundingClientRect().left;
        return w <= line.clientWidth + 1;
      });
    const onScreen = () => !document.hidden && (!copy || +getComputedStyle(copy).opacity > 0.05);

    const turn = (a: number, b: number) => {
      const t = gsap.timeline();
      if (flare) t.fromTo(flare, { xPercent: -160, autoAlpha: 1 }, { xPercent: 360, ease: "power2.inOut", duration: 0.8 }, 0);
      lines.forEach((line, i) => {
        const out = alt(line, a);
        const inn = alt(line, b);
        const oc = letters(out);
        const ic = letters(inn);
        const d = 0.12 + i * 0.09;
        const gone = d + 0.42 + 0.02 * oc.length;
        t.set(ic, { yPercent: 125, color: GOLD }, d);
        t.set(inn, { visibility: "visible" }, d);
        t.to(oc, { yPercent: -125, ease: "power3.in", duration: 0.42, stagger: 0.02 }, d);
        t.to(ic, { yPercent: 0, ease: "power3.out", duration: 0.62, stagger: 0.03 }, d + 0.16);
        t.to(ic, { color: ink, ease: "power1.out", duration: 0.7, stagger: 0.03, clearProps: "color" }, d + 0.55);
        t.set(out, { visibility: "hidden" }, gone);
        t.set(oc, { yPercent: 0 }, gone + 0.01);
      });
      if (sweep) {
        t.fromTo(sweep, { xPercent: -160, autoAlpha: 1 }, { xPercent: 420, ease: "power2.inOut", duration: 0.95 }, 0.2);
        t.set(sweep, { autoAlpha: 0 }, 1.16);
      }
      return t;
    };

    const next = () => {
      if (!onScreen()) {
        wait = gsap.delayedCall(0.8, next);
        return;
      }
      let k = (cur + 1) % n;
      for (let guard = 0; guard < n && !fits(k); guard++) k = (k + 1) % n;
      if (k !== cur) {
        tl = turn(cur, k);
        cur = k;
      }
      wait = gsap.delayedCall(HOLD + (tl?.duration() ?? 0), next);
    };
    wait = gsap.delayedCall(FIRST, next);

    return () => {
      wait?.kill();
      tl?.kill();
      // Back to the first pair, as the server drew it.
      lines.forEach((line) =>
        Array.from(line.children).forEach((el, k) => {
          const e = el as HTMLElement;
          e.style.visibility = k === 0 ? "" : "hidden";
          gsap.set(letters(e), { clearProps: "transform,color" });
        }),
      );
      if (sweep) gsap.set(sweep, { autoAlpha: 0 });
      if (flare) gsap.set(flare, { autoAlpha: 0 });
    };
  }, [play]);

  return (
    <span ref={ref} aria-hidden className="block">
      <span className="relative block overflow-hidden text-(--cx-gold-hi)">
        {HERO.titleLines[0]}
        <span data-turn-flare className="cx-sweep pointer-events-none absolute inset-y-0 left-0 w-[34%] opacity-0" />
      </span>
      <span className="relative block text-(--cx-white)">
        {[0, 1].map((line) => (
          <span key={line} data-turn-line className="cx-turn-line">
            {HERO.turns.map((pair, k) => (
              <span key={pair.join(" ")} className="cx-turn" style={k ? { visibility: "hidden" } : undefined}>
                {Array.from(pair[line]).map((ch, i) => (
                  <span key={i} className="inline-block">
                    {ch}
                  </span>
                ))}
              </span>
            ))}
          </span>
        ))}
        <span data-turn-sweep className="cx-sweep pointer-events-none absolute inset-y-0 left-0 z-10 w-[30%] opacity-0" />
      </span>
    </span>
  );
}
