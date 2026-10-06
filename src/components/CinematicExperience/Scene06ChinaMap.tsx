import { ASSETS } from "./assets";
import { CAPTIONS } from "./content";
import { Caption, DISPLAY, FilmImage } from "./parts";

/**
 * 06 China map reveal. The globe pushes forward and the map rises out of it,
 * tilted like a relief map on a table and settling flat, with a crimson glow
 * behind it. Red silk wraps across the frame and the gold trail follows
 * (both are motif layers in Motifs.tsx).
 *
 * The map is the owner's market map (October 2026): Guangzhou and Foshan,
 * each with the three markets its routes run to. It arrives at night and its
 * network lights up, out from Guangzhou (mapLight.ts, drawn on the canvas
 * over the picture), then the whole country, until it is as printed. The
 * chapter ends with the camera diving into Guangzhou's skyline, where the
 * city rises (Scene07).
 */
export function Scene06ChinaMap() {
  return (
    <div data-cx-scene="map">
      <div className="pointer-events-none absolute inset-0 z-[19] flex items-center justify-center">
        <div data-cx="map-glow" data-cx-hide aria-hidden className="cx-glow-crimson h-[130vw] w-[130vw] shrink-0 md:h-[min(80vw,140vh)] md:w-[min(80vw,140vh)]" />
      </div>
      <div className="pointer-events-none absolute inset-0 z-[20] flex items-center justify-center">
        <div data-cx="map" data-cx-hide className="relative w-[118vw] max-w-none shrink-0 md:w-[min(62vw,100vh)]">
          <FilmImage
            asset={ASSETS.chinaMap}
            alt="A relief map of China: Guangzhou, with routes to the Shaxi, Baima and New Asia markets, and Foshan, with routes to the Louvre, Shunde and Sunlink markets"
            sizes="(min-width: 768px) 62vw, 118vw"
          />
          {/* The network's light (mapLight.ts): the same picture, drawn lit by
              the film's progress, standing in for the one under it. */}
          <canvas data-cx="map-light" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
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
