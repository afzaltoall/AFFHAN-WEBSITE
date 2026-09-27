import type { MouseEvent } from "react";
import { ASSETS } from "./assets";
import { ApplyButton } from "./ApplyButton";
import { FINAL_CTA } from "./content";
import { GoldDust } from "./GoldDust";
import { DISPLAY, FilmImage } from "./parts";
import { Scene15CtaToCountdown } from "./Scene15CtaToCountdown";
import { Scene16Countdown } from "./Scene16Countdown";

/**
 * 14 Final call to action, presented by the host.
 *
 * A second pinned stage (sticky, driven by buildCta in animations.ts). The
 * frame darkens, the silk and the gold trail come back, gold dust rises, and
 * the host steps out of the glow on the left third. His open hand is the
 * anchor: the headline, the line and the button appear beside it, just after
 * he settles, as though he is holding the offer out. Once settled he only
 * breathes (a few pixels, CSS, while this stage is on screen).
 *
 * He is not named or captioned: none has been supplied (content.ts).
 *
 * Desktop: host bottom-left at --host-h tall; the copy's left edge is set from
 * the same variable, so it stays by his palm at every width (the palm sits
 * about 88% across and 29% of the way down the picture). Below lg he
 * stands above the headline at a smaller scale, the same order of events.
 */
export function Scene14FinalCta({ onApply }: { onApply: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <section data-cx-cta aria-labelledby="cx-cta-title" className="relative h-[100svh]">
      <div data-cx-cta-stage data-idle="off" className="sticky top-0 h-[100svh] overflow-hidden [--host-h:min(80svh,50vw)]">
        {/* No backdrop of its own: the night sky runs on from the terms, unbroken
            (a charcoal panel here made a hard edge and a whole empty screen). */}
        <div aria-hidden className="cx-haze-crimson absolute inset-0 opacity-80" />
        <div data-cx="cta-dust" data-cx-hide aria-hidden className="absolute inset-0 z-[5]">
          <GoldDust className="h-full w-full" />
        </div>

        {/* The gold trail, sweeping in behind him. */}
        <div data-cx="cta-gold" data-cx-hide aria-hidden className="pointer-events-none absolute left-[-40vw] top-[10svh] z-[8] w-[170vw] lg:left-[-14vw] lg:top-[40svh] lg:w-[92vw]">
          <FilmImage asset={ASSETS.gold} alt="" sizes="(min-width: 1024px) 92vw, 170vw" className="cx-feather-x" />
        </div>

        {/* The host. */}
        <div className="pointer-events-none absolute left-[6vw] top-[9svh] z-[20] aspect-[992/1586] h-[44svh] lg:bottom-0 lg:left-[7vw] lg:top-auto lg:h-(--host-h)">
          <div data-cx="cta-host" data-cx-hide className="h-full w-full">
            <div className="cx-breathe h-full w-full">
              <FilmImage asset={ASSETS.host} alt={FINAL_CTA.hostAlt} sizes="(min-width: 1024px) 34vw, 30svh" className="h-full w-full object-contain" />
            </div>
          </div>
        </div>

        {/* Red silk, low and in front. */}
        <div data-cx="cta-silk" data-cx-hide aria-hidden className="pointer-events-none absolute bottom-[-6svh] right-[-36vw] z-[40] w-[150vw] lg:bottom-[-10svh] lg:right-[-12vw] lg:w-[78vw]">
          <FilmImage asset={ASSETS.silk} alt="" sizes="(min-width: 1024px) 78vw, 150vw" className="cx-feather-x opacity-90" />
        </div>

        {/* The offer, beside his open hand; above the silk, so nothing crosses the words. */}
        <div className="absolute inset-x-6 top-[56svh] z-[45] lg:inset-x-auto lg:bottom-[calc(var(--host-h)*0.71-8rem)] lg:left-[calc(7vw+var(--host-h)*0.64)] lg:right-[5vw] lg:top-auto">
          <h2
            id="cx-cta-title"
            data-cx="cta-headline"
            data-cx-hide
            className={`${DISPLAY} text-[clamp(44px,12vw,76px)] uppercase leading-[0.92] text-(--cx-white) lg:text-[clamp(52px,5.8vw,112px)]`}
          >
            {FINAL_CTA.headline}
          </h2>
          <p data-cx="cta-line" data-cx-hide className="mt-4 max-w-[30rem] text-[16px] leading-relaxed text-(--cx-mute) lg:mt-6 lg:text-[19px]">
            {FINAL_CTA.line}
          </p>
          <div data-cx="cta-button" data-cx-hide className="mt-7 w-fit lg:mt-9">
            <ApplyButton onClick={onApply} size="lg">
              {FINAL_CTA.button}
            </ApplyButton>
          </div>
          <p data-cx="cta-note" data-cx-hide className="mt-4 text-[13px] tracking-[0.02em] text-(--cx-mute)">
            {FINAL_CTA.note}
          </p>
        </div>

        <Scene15CtaToCountdown />
        <Scene16Countdown onApply={onApply} />
      </div>
    </section>
  );
}
