import { ASSETS } from "./assets";
import { CAPTIONS } from "./content";
import { Caption, FilmImage } from "./parts";

/**
 * 09 Hotel. The environment darkens (a black veil over Foshan while its lights
 * soften), gold light and then red silk sweep across (motif layers), and the
 * hotel comes in with a slight push, warm light blooming behind its doors.
 */
export function Scene09Hotel() {
  return (
    <div data-cx-scene="hotel">
      {/* The veil sits between Foshan (z 10) and the hotel (z 12). */}
      <div data-cx="veil" data-cx-hide aria-hidden className="pointer-events-none absolute inset-0 z-[11] bg-black" />
      <div className="pointer-events-none absolute inset-0 z-[12] flex items-center justify-center">
        <div data-cx="hotel-glow" data-cx-hide aria-hidden className="cx-glow-gold absolute h-[120vw] w-[120vw] md:h-[min(70vw,120vh)] md:w-[min(70vw,120vh)]" />
        <div data-cx="hotel" data-cx-hide className="relative w-[150vw] max-w-none shrink-0 md:w-[min(76vw,134vh)]">
          <FilmImage
            asset={ASSETS.hotel}
            alt="A traveller with a suitcase walking into a warmly lit hotel entrance"
            sizes="(min-width: 768px) 76vw, 150vw"
            className="cx-feather-all"
          />
        </div>
      </div>
      <Caption
        cx="cap-hotel"
        eyebrow={CAPTIONS.hotel.eyebrow}
        title={CAPTIONS.hotel.title}
        className="left-6 top-[max(13svh,5rem)] md:left-[6vw] md:top-[max(16svh,5rem)]"
      />
    </div>
  );
}
