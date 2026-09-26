import type { MouseEvent } from "react";
import { ArrowRight } from "lucide-react";
import { ASSETS } from "./assets";
import { HERO } from "./content";
import { DISPLAY, EYEBROW, FilmImage } from "./parts";

/**
 * 01 Opening. The traveller, the page's only <h1>, and the first call to action.
 *
 * The time opener (ChinaTripOpener) ends by building this frame: its plane
 * lands on the plane painted here, the silk sweeps into place, the traveller
 * resolves from a blur, and the copy rises line by line. So every element
 * starts hidden (data-cx-hide) and the opener's timeline brings it in; at the
 * opener's last frame ("heroComplete") this is exactly the hero it was before
 * the opener existed: same words, same layout, same positions. (data-cx-hero
 * lets the no-JavaScript fallback in page.tsx show it at once.)
 *
 * On desktop the copy sits in the left half and the picture fades out under
 * it; on phones the picture takes the top of the frame and the copy the
 * bottom, pushed up by the navbar's 64px so the button is above the fold.
 */
export function Scene01Opening({ onApply }: { onApply: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <div data-cx-scene="opening">
      {/* Gold glow behind the traveller. */}
      <div data-cx="hero-glow" data-cx-hide data-cx-hero aria-hidden className="pointer-events-none absolute inset-0 z-[29]">
        <div className="cx-glow-gold absolute left-[54%] top-[30%] h-[120vw] w-[120vw] -translate-x-1/2 -translate-y-1/2 md:left-[64%] md:top-[54%] md:h-[min(64vw,118vh)] md:w-[min(64vw,118vh)]" />
      </div>

      {/* Red silk, soft, as a foreground element. The opener sweeps it in. */}
      <div data-cx="hero-silk" data-cx-hide data-cx-hero aria-hidden className="pointer-events-none absolute -left-[30vw] top-[2svh] z-[62] w-[120vw] md:-left-[12vw] md:top-[-6vh] md:w-[62vw]">
        <FilmImage asset={ASSETS.silk} alt="" sizes="(min-width: 768px) 62vw, 120vw" eager className="cx-feather-x opacity-80 blur-[3px] md:blur-[5px]" />
      </div>

      {/* The traveller. */}
      <div className="pointer-events-none absolute inset-0 z-[30] flex items-start justify-center pt-[8svh] md:items-center md:justify-end md:pt-16">
        <div data-cx="hero-img" data-cx-hide data-cx-hero className="relative left-[7vw] w-[156vw] max-w-none shrink-0 md:left-auto md:mr-[-2vw] md:w-[min(68vw,124vh)]">
          <div className="cx-feather-hero">
            <FilmImage
              asset={ASSETS.traveler}
              alt="A traveller with a backpack and suitcase, red silk and cherry blossom around them, a plane climbing overhead"
              sizes="(min-width: 768px) 68vw, 156vw"
              eager
            />
          </div>
        </div>
      </div>

      {/* Title, line and the first call to action. */}
      <div
        id="hero"
        data-cx="hero-copy"
        data-cx-hide
        data-cx-hero
        className="absolute inset-x-0 bottom-0 z-[70] px-6 pb-[calc(4rem+max(3svh,18px))] md:inset-y-0 md:right-auto md:flex md:w-[52vw] md:flex-col md:justify-center md:pb-0 md:pl-[6vw] md:pr-6 md:pt-16"
      >
        {/* A soft falloff of dark behind the words, so no star sits bright
            behind a letter. A gradient, not a panel: it has no edge. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(75%_60%_at_45%_62%,rgb(7_6_8/0.82),rgb(7_6_8/0.45)_55%,transparent_85%)] md:bg-[radial-gradient(62%_46%_at_38%_54%,rgb(7_6_8/0.78),rgb(7_6_8/0.4)_55%,transparent_85%)]"
        />
        <p data-cx="hero-eyebrow" className={EYEBROW}>
          {HERO.eyebrow}
        </p>
        <h1
          className={`${DISPLAY} mt-4 text-[clamp(46px,13vw,76px)] font-normal uppercase leading-[0.9] tracking-[0.005em] md:mt-6 md:text-[clamp(60px,6.4vw,122px)]`}
        >
          {HERO.titleLines.map((line, i) => (
            // Each line rises out of its own mask. The padding and matching
            // negative margin give descenders room without moving the lines.
            <span key={line} className="-mb-[0.06em] block overflow-hidden pb-[0.06em]">
              <span data-cx="hero-line" className={`block ${i === 0 ? "text-(--cx-gold-hi)" : "text-(--cx-white)"}`}>
                {line}{" "}
              </span>
            </span>
          ))}
          <span className="sr-only">{HERO.titleSrTail}</span>
        </h1>
        <p data-cx="hero-lede" className="mt-5 max-w-[30rem] text-[15px] leading-relaxed text-(--cx-mute) md:mt-7 md:text-[18px]">
          {HERO.line}
        </p>
        <div data-cx="hero-actions" className="mt-7 flex items-center gap-7 md:mt-10">
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
