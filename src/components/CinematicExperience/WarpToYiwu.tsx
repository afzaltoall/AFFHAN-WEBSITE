import { CITIES } from "./content";

/**
 * 07 → 08 The jump to Yiwu. After Guangzhou rushes into the lens, the sky
 * goes to light speed: gold streaks out of a vanishing point (the canvas,
 * drawn by warp.ts from the film's progress), a small travel readout whose
 * coordinates run from Guangzhou's to Yiwu's, a flare at the centre, and Yiwu
 * comes out of the light (animations.ts, chapter 08).
 *
 * The readout's numbers are the two captions' own coordinates, so it states
 * nothing the page doesn't already: a journey between two places, no
 * itinerary. Decorative, so hidden from screen readers (the Yiwu caption
 * carries the words).
 */
export function WarpToYiwu() {
  const from = CITIES.find((c) => c.key === "guangzhou")!;
  const to = CITIES.find((c) => c.key === "yiwu")!;
  return (
    <div aria-hidden>
      <canvas data-cx="warp" data-cx-hide className="pointer-events-none absolute inset-0 z-[30] h-full w-full" />
      <div
        data-cx="warp-readout"
        data-cx-hide
        className="pointer-events-none absolute inset-x-0 bottom-[22svh] z-[45] flex flex-col items-center gap-3 px-6 md:bottom-[17svh]"
      >
        <div className="flex w-full max-w-[27rem] items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.34em] text-(--cx-gold)">
          <span>{from.name}</span>
          <span className="relative h-px flex-1 bg-(--cx-white)/15">
            <span data-cx="warp-line" className="absolute inset-0 origin-left scale-x-0 bg-(--cx-gold)" />
            <span data-cx="warp-dot" className="absolute -top-[3px] left-0 -ml-[3.5px] h-[7px] w-[7px] rounded-full bg-(--cx-gold-hi) shadow-[0_0_10px_2px_rgb(242_211_142/0.7)]" />
          </span>
          <span>{to.name}</span>
        </div>
        <p data-cx="warp-coords" className="text-[12px] font-semibold tabular-nums tracking-[0.2em] text-(--cx-white)/80 md:text-[13px]">
          {from.coords}
        </p>
      </div>
    </div>
  );
}
