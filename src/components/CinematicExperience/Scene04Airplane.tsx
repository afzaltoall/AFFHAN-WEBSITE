import { ASSETS } from "./assets";
import { CAPTIONS } from "./content";
import { Caption, FilmImage } from "./parts";

/**
 * 04 Airplane. The plane becomes the hero and carries the camera towards the
 * globe. Motion blur is a stretched, blurred copy of the plane behind it
 * (plane-smear) whose opacity follows the plane's speed: CSS blur has no
 * direction, so a smear is how the streak gets one.
 */
export function Scene04Airplane() {
  return (
    <div data-cx-scene="plane">
      <div className="pointer-events-none absolute inset-0 z-[26] flex items-center justify-center">
        <div data-cx="plane" data-cx-hide className="relative w-[132vw] max-w-none shrink-0 md:w-[min(60vw,106vh)]">
          <div
            data-cx="plane-smear"
            aria-hidden
            className="absolute inset-0 opacity-0"
            style={{ transform: "translate3d(-8%, 4%, 0) scaleX(1.16)", filter: "blur(10px)" }}
          >
            <FilmImage asset={ASSETS.airplane} alt="" sizes="(min-width: 768px) 60vw, 132vw" className="cx-feather-l" />
          </div>
          <FilmImage
            asset={ASSETS.airplane}
            alt="An airliner climbing, trailing gold light"
            sizes="(min-width: 768px) 60vw, 132vw"
            className="cx-feather-l relative"
          />
        </div>
      </div>
      <Caption
        cx="cap-plane"
        eyebrow={CAPTIONS.plane.eyebrow}
        title={CAPTIONS.plane.title}
        className="left-6 top-[14svh] md:left-[6vw] md:top-[16svh]"
      />
    </div>
  );
}
