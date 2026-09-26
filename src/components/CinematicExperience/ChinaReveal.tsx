import { ASSETS } from "./assets";
import { FilmImage } from "./parts";

/**
 * The opener's destination: the camera dives into China on the globe, and the
 * map rises out of that dive, with a crimson and gold glow behind it.
 */
export function ChinaReveal() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[18] flex items-center justify-center">
        <div data-cx="op-map-glow" data-cx-hide className="cx-glow-crimson h-[130vw] w-[130vw] shrink-0 md:h-[min(78vw,140vh)] md:w-[min(78vw,140vh)]" />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[19] flex items-center justify-center">
        <div data-cx="op-map" data-cx-hide className="w-[112vw] max-w-none shrink-0 md:w-[min(60vw,98vh)]">
          <FilmImage asset={ASSETS.chinaMap} alt="" sizes="(min-width: 768px) 60vw, 112vw" />
        </div>
      </div>
    </>
  );
}
