import { ASSETS } from "./assets";
import { FilmImage } from "./parts";

/**
 * The hero, reassembling. As the plane lands on the plane already painted in
 * the hero picture, the passport and the boarding pass fly in from the depth
 * of the frame and settle onto the passport and tickets painted there, then
 * dissolve into them: the hero is not a new scene arriving, it is what the
 * pieces were always going to become. Scene01Opening is the hero itself,
 * unchanged; this file only holds the two pieces that fly into it.
 */
export function HeroReveal() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[31] flex items-center justify-center">
        <div data-cx="op-ghost-passport" data-cx-hide className="w-[60vw] max-w-none shrink-0 md:w-[min(30vw,54vh)]">
          <FilmImage asset={ASSETS.passport} alt="" sizes="(min-width: 768px) 30vw, 60vw" className="cx-feather-all" />
        </div>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[31] flex items-center justify-center">
        <div data-cx="op-ghost-tickets" data-cx-hide className="w-[52vw] max-w-none shrink-0 md:w-[min(26vw,46vh)]">
          <FilmImage asset={ASSETS.boardingPass} alt="" sizes="(min-width: 768px) 26vw, 52vw" />
        </div>
      </div>
    </>
  );
}
