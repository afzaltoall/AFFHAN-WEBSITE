import { ASSETS } from "./assets";
import { CAPTIONS } from "./content";
import { Caption, FilmImage } from "./parts";

/**
 * 02 Passport. The camera pushes past the traveller and the passport grows
 * towards it, with the boarding pass behind (Scene03's object, brought in
 * early and small), gold light behind both and silk crossing the frame.
 * The composite is animated whole: its silk and tickets are baked in.
 */
export function Scene02Passport() {
  return (
    <div data-cx-scene="passport">
      <div className="pointer-events-none absolute inset-0 z-[28] flex items-center justify-center">
        <div data-cx="passport" data-cx-hide className="w-[150vw] max-w-none shrink-0 md:w-[min(74vw,130vh)]">
          <FilmImage
            asset={ASSETS.passport}
            alt="A passport with boarding passes tucked inside, wrapped in red silk and gold light"
            sizes="(min-width: 768px) 74vw, 150vw"
          />
        </div>
      </div>
      <Caption
        cx="cap-passport"
        eyebrow={CAPTIONS.passport.eyebrow}
        title={CAPTIONS.passport.title}
        className="bottom-[9svh] left-6 md:bottom-[11svh] md:left-[6vw]"
      />
    </div>
  );
}
