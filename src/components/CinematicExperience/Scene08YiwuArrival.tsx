import { CAPTIONS, CITIES } from "./content";
import { DISPLAY } from "./parts";
import { CityCaption, CitySkyline } from "./Scene07CityJourney";

/**
 * 08 Yiwu arrival. The last city does not rush past: it arrives large and the
 * camera gently approaches it. Arrival and destination only. This is not a
 * marketplace or product section, and the copy does not mention trade.
 */
export function Scene08YiwuArrival() {
  const yiwu = CITIES.find((c) => c.key === "yiwu")!;
  return (
    <div data-cx-scene="yiwu">
      <CitySkyline city={yiwu} alt="Yiwu at night, lit up under a clear sky" />
      <CityCaption city={yiwu}>
        <p data-cx-part="line" className={`${DISPLAY} mt-4 text-[clamp(20px,2.2vw,32px)] text-(--cx-mute)`}>{CAPTIONS.yiwu.title}</p>
      </CityCaption>
    </div>
  );
}
