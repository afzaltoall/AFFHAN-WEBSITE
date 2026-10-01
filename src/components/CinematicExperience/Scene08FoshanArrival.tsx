import { CAPTIONS, CITIES } from "./content";
import { DISPLAY } from "./parts";
import { CityCaption, CitySkyline } from "./Scene07CityJourney";

/**
 * 08 Foshan arrival. The last city does not rush past: it comes out of the
 * light and the camera gently approaches it. Arrival and destination only:
 * the words say you have arrived and nothing about trade. The picture is
 * Foshan's furniture market (the owner's, October 2026); until then this was
 * Yiwu and its trade market.
 */
export function Scene08FoshanArrival() {
  const foshan = CITIES.find((c) => c.key === "foshan")!;
  return (
    <div data-cx-scene="foshan">
      <CitySkyline
        city={foshan}
        alt="Foshan's furniture market: the gateway under the Foshan Furniture sign, showrooms and buyers along the avenue"
      />
      <CityCaption city={foshan}>
        <p data-cx-part="line" className={`${DISPLAY} mt-4 text-[clamp(20px,2.2vw,32px)] text-(--cx-mute)`}>{CAPTIONS.foshan.title}</p>
      </CityCaption>
    </div>
  );
}
