import { ASSETS } from "./assets";
import { FilmImage } from "./parts";

/**
 * The opener's gold trail and plane.
 *
 * The trail is one element with two jobs: first the India-to-China route over
 * the globe, drawn on by a wipe (a window sliding one way over a picture
 * sliding the other, so the light is revealed without being stretched); then
 * it lifts off the globe, brightens, and becomes the path the plane flies.
 *
 * The plane rides it from the lower left and finishes exactly on top of the
 * plane already painted in the hero picture, at its size and angle, then
 * dissolves into it (the match is measured from the hero at run time; see
 * ANCHORS in assets.ts). A stretched, blurred copy behind it is the motion
 * blur, strongest while it is fastest.
 */
export function FlightTransition() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[27] flex items-center justify-center">
        <div data-cx="op-trail" data-cx-hide className="w-[150vw] max-w-none shrink-0 md:w-[min(90vw,160vh)]">
          <div data-cx="op-trail-window" className="overflow-hidden">
            <div data-cx="op-trail-img">
              <FilmImage asset={ASSETS.gold} alt="" sizes="(min-width: 768px) 90vw, 150vw" className="cx-feather-x" />
            </div>
          </div>
        </div>
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[33] flex items-center justify-center">
        <div data-cx="op-plane" data-cx-hide className="relative w-[96vw] max-w-none shrink-0 md:w-[min(44vw,78vh)]">
          <div
            data-cx="op-plane-smear"
            className="absolute inset-0 opacity-0"
            style={{ transform: "translate3d(-8%, 4%, 0) scaleX(1.16)", filter: "blur(10px)" }}
          >
            <FilmImage asset={ASSETS.airplane} alt="" sizes="(min-width: 768px) 44vw, 96vw" className="cx-feather-l" />
          </div>
          <FilmImage asset={ASSETS.airplane} alt="" sizes="(min-width: 768px) 44vw, 96vw" className="cx-feather-l relative" />
        </div>
      </div>
    </>
  );
}
