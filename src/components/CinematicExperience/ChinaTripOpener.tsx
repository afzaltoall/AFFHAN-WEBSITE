import type { CSSProperties, MouseEvent } from "react";
import { ChinaReveal } from "./ChinaReveal";
import { OPENER } from "./content";
import { FlightTransition } from "./FlightTransition";
import { GlobeTransition } from "./GlobeTransition";
import { HeroReveal } from "./HeroReveal";
import { DISPLAY } from "./parts";
import { TimeOrb } from "./TimeOrb";

/**
 * 00 The time opener: TIME -> CLOCK -> ORBIT -> GLOBE -> CHINA -> RED SILK ->
 * GOLD TRAIL -> AIRPLANE -> TRAVELLER -> the hero, as the first part of the
 * film's one pinned stage and one scrubbed timeline (buildOpener in
 * animations.ts, labelled timeStart ... heroComplete). It is not a preloader
 * and nothing plays by itself: the scroll is the clock.
 *
 * It lives inside the film's stage rather than in a pinned section of its
 * own, because the hero it ends on is already in that stage: the opener
 * dissolves into it with no seam, no second pin, no jump.
 *
 * Markup only. The red silk it bridges with is the hero's own silk
 * (Scene01Opening): it enters here and settles into exactly its hero pose.
 */

// A dozen and a half motes of gold dust: fixed positions, slow CSS drift.
const DUST = (() => {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  return Array.from({ length: 16 }, () => ({
    left: 6 + rnd() * 88,
    top: 8 + rnd() * 84,
    size: 1.4 + rnd() * 2,
    dur: 7 + rnd() * 8,
    delay: -rnd() * 10,
  }));
})();

export function ChinaTripOpener({ onSkip }: { onSkip: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <div data-cx-scene="opener" data-cx-opener>
      {/* Atmosphere: a very low warm glow, near-invisible grain, gold dust. */}
      <div data-cx="op-atmos" aria-hidden className="pointer-events-none absolute inset-0 z-[3]">
        <div data-cx="op-warm" className="cx-op-warm absolute inset-0" />
        <div className="cx-grain absolute inset-0" />
        <div data-cx="op-dust" className="absolute inset-0">
          {DUST.map((d, i) => (
            <span
              key={i}
              className="cx-mote"
              style={{
                left: `${d.left.toFixed(2)}%`,
                top: `${d.top.toFixed(2)}%`,
                "--m": `${d.size.toFixed(2)}px`,
                "--dur": `${d.dur.toFixed(2)}s`,
                "--delay": `${d.delay.toFixed(2)}s`,
              } as CSSProperties}
            />
          ))}
        </div>
      </div>

      <TimeOrb />
      <GlobeTransition />
      <ChinaReveal />
      <FlightTransition />
      <HeroReveal />

      {/* TIME MOVES. / SO SHOULD YOU. Each line rises out of its own mask. */}
      <div
        data-cx="op-words"
        className="pointer-events-none absolute inset-x-0 top-[calc(50%+min(29vh,40vw)+3.5vh)] z-[45] px-6 text-center"
      >
        {OPENER.lines.map((line, i) => (
          <span key={line} data-cx={`op-word-${i + 1}`} data-cx-hide className="block overflow-hidden pb-[0.12em]">
            <span
              data-cx={`op-word-${i + 1}-in`}
              className={`${DISPLAY} block text-[clamp(22px,6.4vw,34px)] uppercase leading-[1.15] tracking-[0.2em] md:text-[clamp(26px,2.3vw,44px)] ${
                i === 0 ? "text-(--cx-white)" : "text-(--cx-gold-hi)"
              }`}
            >
              {line}
            </span>
          </span>
        ))}
      </div>

      {/* The only instruction the first frame gives. */}
      <div data-cx="op-cue" aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[7svh] z-[90] flex flex-col items-center gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.34em] text-(--cx-mute)">{OPENER.scrollCue}</span>
        <span className="relative h-10 w-px overflow-hidden bg-(--cx-faint)">
          <span className="cx-cue absolute inset-0 bg-(--cx-gold)" />
        </span>
      </div>

      {/* For anyone who would rather go straight to the trip. */}
      <a
        data-cx="op-skip"
        href="#hero"
        onClick={onSkip}
        className="absolute bottom-5 left-6 z-[90] rounded-full border border-(--cx-white)/20 px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-(--cx-white) transition-colors hover:border-(--cx-gold) hover:text-(--cx-gold-hi) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--cx-white) md:bottom-7 md:left-[6vw]"
      >
        {OPENER.skip}
      </a>
    </div>
  );
}
