import { ASSETS } from "./assets";
import { CAPTIONS } from "./content";
import { Caption, FilmImage } from "./parts";

/**
 * 03 Boarding pass. Becomes the foreground hero with a little rotation and
 * perspective, a light sweep across the paper, and a slow float. The sweep is
 * masked by the pass's own picture (cx-mask-boarding), so light only lands on
 * the tickets, never on the dark around them.
 *
 * NOTE: the artwork has a flight number (CA528) and a date (18 OCT 2024)
 * printed on it. They are part of the flattened image and cannot be removed
 * here; see README.md.
 */
export function Scene03BoardingPass() {
  return (
    <div data-cx-scene="boarding">
      <div className="pointer-events-none absolute inset-0 z-[24] flex items-center justify-center">
        <div data-cx="boarding" data-cx-hide className="relative w-[128vw] max-w-none shrink-0 md:w-[min(62vw,110vh)]">
          <FilmImage
            asset={ASSETS.boardingPass}
            alt="Two boarding passes from India to China"
            sizes="(min-width: 768px) 62vw, 128vw"
          />
          <div aria-hidden className="cx-mask-boarding absolute inset-0 overflow-hidden">
            <div data-cx="boarding-sweep" className="cx-sweep absolute inset-0" />
          </div>
        </div>
      </div>
      <Caption
        cx="cap-boarding"
        eyebrow={CAPTIONS.boarding.eyebrow}
        title={CAPTIONS.boarding.title}
        className="bottom-[9svh] left-6 md:bottom-[11svh] md:left-[6vw]"
      />
    </div>
  );
}
