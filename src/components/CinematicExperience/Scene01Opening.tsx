import type { MouseEvent } from "react";
import { ArrowRight } from "lucide-react";
import { ASSETS } from "./assets";
import { HERO } from "./content";
import { DISPLAY, EYEBROW, FilmImage } from "./parts";

/**
 * 01 Opening. The traveller, the page's only <h1>, and the first call to action.
 *
 * This is the frame the server paints, so it carries everything the first
 * viewport needs and nothing else: the traveller composite is the one eager,
 * high-priority image on the page. Its entrance (the push-in, the silk from
 * the frame edge, the gold glow forming behind him) is CSS and plays on the
 * first paint without waiting for JavaScript; the scroll timeline then takes
 * over the outer wrappers (data-cx).
 *
 * On desktop the copy sits in the left half and the picture fades out under
 * it; on phones the picture takes the top of the frame and the copy the
 * bottom, pushed up by the navbar's 64px so the button is above the fold.
 */
export function Scene01Opening({ onApply }: { onApply: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <div data-cx-scene="opening">
      {/* Gold glow forming behind the traveller. */}
      <div data-cx="hero-glow" aria-hidden className="pointer-events-none absolute inset-0 z-[29]">
        <div className="cx-enter-glow cx-glow-gold absolute left-[54%] top-[30%] h-[120vw] w-[120vw] -translate-x-1/2 -translate-y-1/2 md:left-[64%] md:top-[54%] md:h-[min(64vw,118vh)] md:w-[min(64vw,118vh)]" />
      </div>

      {/* Red silk entering from the frame edge, soft, as a foreground element. */}
      <div data-cx="hero-silk" aria-hidden className="pointer-events-none absolute -left-[30vw] top-[2svh] z-[62] w-[120vw] md:-left-[12vw] md:top-[-6vh] md:w-[62vw]">
        <div className="cx-enter-silk">
          <FilmImage asset={ASSETS.silk} alt="" sizes="(min-width: 768px) 62vw, 120vw" eager className="cx-feather-x opacity-80 blur-[3px] md:blur-[5px]" />
        </div>
      </div>

      {/* The traveller. */}
      <div className="pointer-events-none absolute inset-0 z-[30] flex items-start justify-center pt-[8svh] md:items-center md:justify-end md:pt-16">
        <div data-cx="hero-img" className="relative left-[7vw] w-[156vw] max-w-none shrink-0 md:left-auto md:mr-[-2vw] md:w-[min(68vw,124vh)]">
          <div className="cx-enter-push cx-feather-hero">
            <FilmImage
              asset={ASSETS.traveler}
              alt="A traveller with a backpack and suitcase, red silk and cherry blossom around them, a plane climbing overhead"
              sizes="(min-width: 768px) 68vw, 156vw"
              eager
              priority
            />
          </div>
        </div>
      </div>

      {/* Title, line and the first call to action. */}
      <div
        data-cx="hero-copy"
        className="absolute inset-x-0 bottom-0 z-[70] px-6 pb-[calc(4rem+max(3svh,18px))] md:inset-y-0 md:right-auto md:flex md:w-[52vw] md:flex-col md:justify-center md:pb-0 md:pl-[6vw] md:pr-6 md:pt-16"
      >
        <p className={`${EYEBROW} cx-enter-rise`} style={{ animationDelay: "0.25s" }}>
          {HERO.eyebrow}
        </p>
        <h1
          className={`${DISPLAY} cx-enter-rise mt-4 text-[clamp(46px,13vw,76px)] font-normal uppercase leading-[0.9] tracking-[0.005em] md:mt-6 md:text-[clamp(60px,6.4vw,122px)]`}
          style={{ animationDelay: "0.4s" }}
        >
          {HERO.titleLines.map((line, i) => (
            <span key={line} className={`block ${i === 0 ? "text-(--cx-gold-hi)" : "text-(--cx-white)"}`}>
              {line}{" "}
            </span>
          ))}
          <span className="sr-only">{HERO.titleSrTail}</span>
        </h1>
        <p
          className="cx-enter-rise mt-5 max-w-[30rem] text-[15px] leading-relaxed text-(--cx-mute) md:mt-7 md:text-[18px]"
          style={{ animationDelay: "0.55s" }}
        >
          {HERO.line}
        </p>
        <div className="cx-enter-rise mt-7 flex items-center gap-7 md:mt-10" style={{ animationDelay: "0.7s" }}>
          <a
            href="#apply"
            onClick={onApply}
            className="group inline-flex items-center gap-3 rounded-full bg-(--cx-gold) py-3 pl-6 pr-3 text-[15px] font-semibold tracking-[0.01em] text-(--cx-ink) shadow-[0_10px_40px_-12px_rgb(214_168_78/0.7)] transition-colors duration-300 hover:bg-(--cx-gold-hi) focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--cx-white) md:text-[16px]"
          >
            {HERO.cta}
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-(--cx-ink)/10">
              <ArrowRight size={16} aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5" />
            </span>
          </a>
          <span aria-hidden className="hidden items-center gap-3 text-[11px] uppercase tracking-[0.24em] text-(--cx-mute) md:flex">
            <span className="relative h-10 w-px overflow-hidden bg-(--cx-faint)">
              <span className="cx-cue absolute inset-0 bg-(--cx-gold)" />
            </span>
            {HERO.scrollHint}
          </span>
        </div>
      </div>
    </div>
  );
}
