"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { HERO } from "./content";

/**
 * The headline's turns. Under FREE, the second and third lines take turns
 * through what the offer covers, in HERO.line's own words (HERO.turns):
 * BUSINESS TRIP, ROUND-TRIP FLIGHT, HOTEL STAY, LOCAL TRANSPORT, and round.
 *
 * At each turn FREE catches the light first, letter by letter; then the old
 * words' letters lift out of their lines, one after another, and the new
 * ones rise in, each landing gold and glowing and cooling to white, so the
 * landing itself is the light crossing the words. Every letter is masked by
 * its line, so nothing ever overlaps.
 *
 * The light lives in the letters (their colour and glow), never in a layer
 * over them: an overlaid streak brightens whatever is under it, and one ran
 * on past the words across the traveller's photograph.
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
const GLOW = "0px 0px 16px rgba(242, 211, 142, 0.75)";
const GLOW_HI = "0px 0px 26px rgba(255, 236, 190, 0.85)";
const NO_GLOW = "0px 0px 0px rgba(242, 211, 142, 0)";

export function HeroTurns({ play }: { play: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!play || !root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const copy = root.closest<HTMLElement>("[data-cx='hero-copy']");
    const free = Array.from(root.querySelectorAll<HTMLElement>("[data-turn-free] > span"));
    const lines = Array.from(root.querySelectorAll<HTMLElement>("[data-turn-line]"));
    const alt = (line: HTMLElement, k: number) => line.children[k] as HTMLElement;
    const letters = (el: HTMLElement) => Array.from(el.children) as HTMLElement[];
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
      // FREE catches the light, letter by letter, and lets it go.
      t.to(free, { color: "#fff4d6", textShadow: GLOW_HI, ease: "power1.out", duration: 0.22, stagger: 0.07 }, 0);
      t.to(free, { color: GOLD, textShadow: NO_GLOW, ease: "power1.in", duration: 0.5, stagger: 0.07, clearProps: "color,textShadow" }, 0.22);
      lines.forEach((line, i) => {
        const out = alt(line, a);
        const inn = alt(line, b);
        const oc = letters(out);
        const ic = letters(inn);
        const d = 0.12 + i * 0.09;
        const gone = d + 0.42 + 0.02 * oc.length;
        // Hidden below the line and unlit; they gather their glow as they rise.
        t.set(ic, { yPercent: 125, color: GOLD, textShadow: NO_GLOW }, d);
        t.set(inn, { visibility: "visible" }, d);
        t.to(oc, { yPercent: -125, ease: "power3.in", duration: 0.42, stagger: 0.02 }, d);
        t.to(ic, { yPercent: 0, textShadow: GLOW, ease: "power3.out", duration: 0.62, stagger: 0.03 }, d + 0.16);
        t.to(ic, { color: ink, textShadow: NO_GLOW, ease: "power1.out", duration: 0.7, stagger: 0.03, clearProps: "color,textShadow" }, d + 0.55);
        t.set(out, { visibility: "hidden" }, gone);
        t.set(oc, { yPercent: 0 }, gone + 0.01);
      });
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
      gsap.set(free, { clearProps: "color,textShadow" });
      lines.forEach((line) =>
        Array.from(line.children).forEach((el, k) => {
          const e = el as HTMLElement;
          e.style.visibility = k === 0 ? "" : "hidden";
          gsap.set(letters(e), { clearProps: "transform,color,textShadow" });
        }),
      );
    };
  }, [play]);

  return (
    <span ref={ref} aria-hidden className="block">
      <span data-turn-free className="block text-(--cx-gold-hi)">
        {Array.from(HERO.titleLines[0]).map((ch, i) => (
          <span key={i} className="inline-block">
            {ch}
          </span>
        ))}
      </span>
      <span className="block text-(--cx-white)">
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
      </span>
    </span>
  );
}
