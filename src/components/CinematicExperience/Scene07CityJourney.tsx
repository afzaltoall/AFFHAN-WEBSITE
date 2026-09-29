import type { ReactNode } from "react";
import { ASSETS, type AssetKey } from "./assets";
import { CITIES } from "./content";
import { DISPLAY, EYEBROW, FilmImage } from "./parts";

/**
 * 07 City journey: Shanghai, Beijing, Guangzhou, in one continuous camera pass.
 *
 * Never a grid and never cards. The three skylines are stacked in depth in the
 * same frame (Shanghai nearest, then Beijing, then Guangzhou behind it) and the
 * timeline flies the camera through them: each city rises from depth, holds,
 * then rushes past the lens and blurs out as the next one emerges behind it.
 * Yiwu, the destination, is Scene08.
 *
 * The captions are facts about the cities (name, characters, coordinates),
 * never an itinerary; see README.md.
 */

const DEPTH: Record<string, string> = {
  shanghai: "z-[18]",
  beijing: "z-[16]",
  guangzhou: "z-[14]",
  yiwu: "z-[10]",
};

export function CitySkyline({ city, alt }: { city: (typeof CITIES)[number]; alt: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 flex items-center justify-center ${DEPTH[city.key]}`}>
      <div data-cx={`city-${city.key}`} data-cx-hide className="w-[160vw] max-w-none shrink-0 md:w-[min(80vw,142vh)]">
        <FilmImage
          asset={ASSETS[city.key as AssetKey]}
          alt={alt}
          sizes="(min-width: 768px) 80vw, 160vw"
          className="cx-feather-xb"
        />
      </div>
    </div>
  );
}

export function CityCaption({ city, children }: { city: (typeof CITIES)[number]; children?: ReactNode }) {
  return (
    <div
      data-cx={`cap-${city.key}`}
      data-cx-hide
      className="cx-city-cap pointer-events-none absolute bottom-[max(8svh,4.5rem)] left-6 z-40 flex items-end gap-4 md:bottom-[max(9svh,5rem)] md:left-[6vw] md:gap-6"
    >
      <span data-cx-part="hanzi" aria-hidden className={`${DISPLAY} text-[clamp(22px,3vw,46px)] leading-none tracking-[0.18em] text-(--cx-gold) [writing-mode:vertical-rl]`}>
        {city.hanzi}
      </span>
      <div>
        <p data-cx-part="coords" className={`${EYEBROW} tabular-nums`}>{city.coords}</p>
        {/* Never wider than the screen: GUANGZHOU is 6.54x its font size, and
            on a phone the name starts 62px in (24 + hanzi 22 + gap 16), so the
            size is capped at (100vw - 86px) / 6.54, 35.8px at 320. It wrapped
            there as GUANGZH / OU. 19svh caps it on a landscape phone. */}
        <p data-cx-part="name" className={`${DISPLAY} cx-city-name mt-2 text-[length:min(clamp(50px,12vw,170px),calc((100vw_-_86px)/6.54),19svh)] uppercase leading-[0.84] tracking-[0.01em] md:text-[length:min(clamp(64px,9.4vw,170px),19svh)]`}>
          {city.name}
        </p>
        {children}
      </div>
    </div>
  );
}

const ALTS: Record<string, string> = {
  shanghai: "Shanghai's skyline at dusk across the river, wrapped in red silk",
  beijing: "Beijing: the Temple of Heaven with the Forbidden City and the modern skyline",
  guangzhou: "Guangzhou at night: the Canton Tower and the river",
};

export function Scene07CityJourney() {
  return (
    <div data-cx-scene="cities">
      {CITIES.filter((c) => c.key !== "yiwu").map((city) => (
        <div key={city.key}>
          <CitySkyline city={city} alt={ALTS[city.key]} />
          <CityCaption city={city} />
        </div>
      ))}
    </div>
  );
}
