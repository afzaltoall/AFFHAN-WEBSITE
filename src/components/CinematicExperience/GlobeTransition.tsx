import { ASSETS } from "./assets";
import { FilmImage } from "./parts";

/**
 * The opener's world: the globe grows out of the glow at the clock's centre,
 * the orbit (TimeOrb) turning round it, and the camera pushes towards Asia.
 * The India-to-China route is drawn with the gold light trail (it lives in
 * FlightTransition, because the same trail goes on to carry the plane).
 *
 * Its own copy of the globe picture, separate from the later globe chapter,
 * so the two parts of the page never share an element's state.
 */
export function GlobeTransition() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[22] flex items-center justify-center">
      <div data-cx="op-globe" data-cx-hide className="w-[min(56vh,86vw)] shrink-0">
        <FilmImage asset={ASSETS.globe} alt="" sizes="(min-width: 768px) 56vh, 86vw" />
      </div>
    </div>
  );
}
