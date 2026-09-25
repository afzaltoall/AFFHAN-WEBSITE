import { ASSETS } from "./assets";
import { FilmImage } from "./parts";

/**
 * The film's two recurring motifs and its atmosphere.
 *
 * The red silk ribbon and the gold light trail are the thread that stitches the
 * chapters together, so they are not owned by any one scene: each exists as a
 * back layer (behind the pictures) and a front layer (passing the lens, soft),
 * and the film timeline flies them through the chapters the brief names:
 *   silk:  opening -> passport -> China reveal -> cities -> hotel -> FREE
 *   gold:  opening -> plane -> globe (as its orbit) -> China -> hotel -> FREE
 * They return in the final call to action (Scene14) as that stage's own layers.
 *
 * Atmosphere: three washes of light (warm, crimson, deep) that the timeline
 * cross-fades between chapters, and a fixed vignette.
 */
export function Motifs() {
  return (
    <>
      <div data-cx="haze-warm" aria-hidden className="cx-haze-warm pointer-events-none absolute inset-0 z-[1]" />
      <div data-cx="haze-crimson" data-cx-hide aria-hidden className="cx-haze-crimson pointer-events-none absolute inset-0 z-[1]" />
      <div data-cx="haze-deep" data-cx-hide aria-hidden className="cx-haze-deep pointer-events-none absolute inset-0 z-[1]" />

      <div aria-hidden className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
        <div data-cx="gold-back" data-cx-hide className="w-[210vw] max-w-none shrink-0 md:w-[118vw]">
          <FilmImage asset={ASSETS.gold} alt="" sizes="(min-width: 768px) 118vw, 210vw" className="cx-feather-x" />
        </div>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[6] flex items-center justify-center">
        <div data-cx="silk-back" data-cx-hide className="w-[200vw] max-w-none shrink-0 md:w-[112vw]">
          <FilmImage asset={ASSETS.silk} alt="" sizes="(min-width: 768px) 112vw, 200vw" className="cx-feather-x opacity-85" />
        </div>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[60] flex items-center justify-center">
        <div data-cx="silk-front" data-cx-hide className="w-[220vw] max-w-none shrink-0 md:w-[120vw]">
          <FilmImage asset={ASSETS.silk} alt="" sizes="(min-width: 768px) 120vw, 220vw" className="cx-feather-x blur-[3px]" />
        </div>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[61] flex items-center justify-center">
        <div data-cx="gold-front" data-cx-hide className="w-[220vw] max-w-none shrink-0 md:w-[124vw]">
          <FilmImage asset={ASSETS.gold} alt="" sizes="(min-width: 768px) 124vw, 220vw" className="cx-feather-x" />
        </div>
      </div>

      <div aria-hidden className="cx-vignette pointer-events-none absolute inset-0 z-[85]" />
    </>
  );
}
