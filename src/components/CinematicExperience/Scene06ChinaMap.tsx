import { ASSETS } from "./assets";
import { CAPTIONS } from "./content";
import { Caption, DISPLAY, FilmImage } from "./parts";

/**
 * 06 China map reveal. The globe pushes forward and the map rises out of it,
 * tilted like a relief map on a table and settling flat, with a crimson glow
 * behind it. Red silk wraps across the frame and the gold trail follows
 * (both are motif layers in Motifs.tsx). The chapter ends with the camera
 * diving into the Guangzhou marker, where the city rises (Scene07). The map
 * still marks Beijing and Shanghai: they are in the owner's artwork, though
 * the film no longer goes to them.
 */
export function Scene06ChinaMap() {
  return (
    <div data-cx-scene="map">
      <div className="pointer-events-none absolute inset-0 z-[19] flex items-center justify-center">
        <div data-cx="map-glow" data-cx-hide aria-hidden className="cx-glow-crimson h-[130vw] w-[130vw] shrink-0 md:h-[min(80vw,140vh)] md:w-[min(80vw,140vh)]" />
      </div>
      <div className="pointer-events-none absolute inset-0 z-[20] flex items-center justify-center">
        <div data-cx="map" data-cx-hide className="w-[118vw] max-w-none shrink-0 md:w-[min(62vw,100vh)]">
          <FilmImage
            asset={ASSETS.chinaMap}
            alt="A relief map of China marking Beijing, Shanghai, Yiwu and Guangzhou"
            sizes="(min-width: 768px) 62vw, 118vw"
          />
        </div>
      </div>
      <Caption
        cx="cap-map"
        eyebrow={CAPTIONS.map.eyebrow}
        title={CAPTIONS.map.title}
        className="left-6 top-[max(13svh,5rem)] md:left-[6vw] md:top-[max(17svh,5rem)]"
      >
        <p aria-hidden className={`${DISPLAY} mt-2 text-[clamp(22px,2.6vw,40px)] tracking-[0.2em] text-(--cx-gold)`}>
          {CAPTIONS.map.hanzi}
        </p>
      </Caption>
    </div>
  );
}
