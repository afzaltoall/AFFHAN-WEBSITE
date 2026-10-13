"use client";

import { useEffect, useRef } from "react";
import { TRIP_FACTS } from "@/lib/trip-legal";
import { ASSETS, srcSetOf, type FilmAsset } from "./assets";
import { CAPTIONS, CITIES, FREE, INCLUDED, INCLUDED_EYEBROW } from "./content";

/**
 * The film on a phone: the journey as a route of cards, one stop each, with
 * its picture and, in plain words from the Terms, what it means for whoever
 * applies (the owner, 2026-10-13: on a phone the scroll animation stuck, the
 * chapters "looked separated", and the page should explain itself, like the
 * app). Shown only where lite.ts's phone query holds (cinematic.css), in
 * place of chapters 02-11 of the film; the opening frame above it stays.
 *
 * Nothing here moves with the scroll. Each card rises into place once, the
 * first time it comes on screen (a CSS transition the browser's compositor
 * runs), and never under reduced motion; without script every card is simply
 * there. The pictures are the film's own, the phone copies, loaded lazily, so
 * a computer (where this is not shown) never fetches them.
 *
 * Facts that would read as a schedule are not stated: the Terms leave the
 * itinerary to be announced, so the cities are described, not promised.
 */

type Stop = {
  key: string;
  asset: FilmAsset;
  alt: string;
  eyebrow: string;
  title: string;
  text: string;
  /** Short facts set as chips under the text. */
  facts?: readonly string[];
  /** A detail only this stop has: the city's characters and coordinates. */
  place?: { hanzi: string; coords: string };
};

const [guangzhou, foshan] = CITIES;

/** "25 November 2026" → "25 November". */
const dayMonth = (d: string) => d.split(" ").slice(0, 2).join(" ");

const STOPS: readonly Stop[] = [
  {
    key: "passport",
    asset: ASSETS.passport,
    alt: "A passport with boarding passes tucked inside, wrapped in red silk and gold light",
    eyebrow: CAPTIONS.passport.eyebrow,
    title: CAPTIONS.passport.title,
    text: "Every traveller brings a valid passport. If you are selected, AFFHAN may ask for its details to book your travel, and may help with your visa.",
  },
  {
    key: "boarding",
    asset: ASSETS.boardingPass,
    alt: "Two boarding passes from India to China",
    eyebrow: CAPTIONS.boarding.eyebrow,
    title: CAPTIONS.boarding.title,
    text: `Apply by ${dayMonth(TRIP_FACTS.applicationsClose)} and you are given a Trip ID: your boarding pass for the draw. Then ${TRIP_FACTS.winners} winners are chosen at random and announced on ${TRIP_FACTS.winnersAnnounced}.`,
    facts: [`${TRIP_FACTS.winners} winners`, "Random draw"],
  },
  {
    key: "plane",
    asset: ASSETS.airplane,
    alt: "An airliner climbing, trailing gold light",
    eyebrow: CAPTIONS.plane.eyebrow,
    title: CAPTIONS.plane.title,
    text: "Your round-trip flight, to China and home again, is covered. AFFHAN books the airline, the route and the schedule.",
    facts: ["Economy class", "Round trip"],
  },
  {
    key: "globe",
    asset: ASSETS.globe,
    alt: "The globe, with a gold route from India to China",
    eyebrow: CAPTIONS.globe.eyebrow,
    title: CAPTIONS.globe.title,
    text: "The winners travel together, as one group, on the official itinerary, with group transport while you are in China.",
    facts: ["Group transport"],
  },
  {
    key: "map",
    asset: ASSETS.chinaMap,
    alt: "A relief map of China: Guangzhou, with routes to the Shaxi, Baima and New Asia markets, and Foshan, with routes to the Louvre, Shunde and Sunlink markets",
    eyebrow: CAPTIONS.map.eyebrow,
    title: CAPTIONS.map.title,
    text: "Markets, showrooms and business destinations are visited together, as part of the group itinerary, with a business guide for the group.",
    facts: ["Business guidance"],
  },
  {
    key: "guangzhou",
    asset: ASSETS.guangzhou,
    alt: "Guangzhou at night: the Canton Tower and the river",
    eyebrow: "The city",
    title: guangzhou.name,
    text: "China's great trading city on the Pearl River, and home of the Canton Fair.",
    place: { hanzi: guangzhou.hanzi, coords: guangzhou.coords },
  },
  {
    key: "foshan",
    asset: ASSETS.foshan,
    alt: "Foshan's furniture market: the gateway under the Foshan Furniture sign, showrooms and buyers along the avenue",
    eyebrow: CAPTIONS.foshan.eyebrow,
    title: foshan.name,
    text: "Beside Guangzhou, and known the world over for its furniture markets.",
    place: { hanzi: foshan.hanzi, coords: foshan.coords },
  },
  {
    key: "hotel",
    asset: ASSETS.hotel,
    alt: "A traveller with a suitcase walking into a warmly lit hotel entrance",
    eyebrow: CAPTIONS.hotel.eyebrow,
    title: CAPTIONS.hotel.title,
    text: "Your hotel stay in China is covered, in group or shared rooms. Private rooms are not included.",
    facts: ["Shared rooms"],
  },
];

const DISPLAY = "font-[family-name:var(--font-cx-display)]";

export function MobileJourney() {
  const ref = useRef<HTMLElement>(null);

  // Each card rises into place the first time it comes on screen.
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>("[data-mj-card]"));
    // Already on screen (a reload part-way down): shown as they are.
    const fold = window.innerHeight;
    cards.forEach((c) => {
      if (c.getBoundingClientRect().top < fold) c.dataset.in = "";
    });
    root.dataset.enter = "";
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.in = "";
          io.unobserve(e.target);
        }
      },
      // Starting just before it comes up the screen, so a stop on the route is never seen without its card.
      { rootMargin: "0px 0px 10% 0px" },
    );
    cards.forEach((c) => {
      if (!("in" in c.dataset)) io.observe(c);
    });
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} aria-labelledby="mj-title" className="mj">
      {/* One plain heading: an eyebrow over a poster-size line reads as made by a machine to the owner, and
          "Stop by stop." felt odd (2026-10-13). */}
      <header className="mj-head">
        <h2 id="mj-title" className={`${DISPLAY} mj-heading`}>
          Your journey to China
        </h2>
        <p className="mj-line">Everything the trip covers, from your passport to your hotel.</p>
      </header>

      <ol className="mj-route">
        {STOPS.map((s, i) => (
          <li key={s.key} className="mj-stop">
            <article data-mj-card className="mj-card" aria-labelledby={`mj-${s.key}`}>
              <div className="mj-pic" style={{ aspectRatio: `${s.asset.w} / ${s.asset.h}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.asset.phone}
                  srcSet={srcSetOf(s.asset)}
                  sizes="calc(100vw - 32px)"
                  width={s.asset.w}
                  height={s.asset.h}
                  alt={s.alt}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="cx-feather-all"
                />
              </div>
              <div className="mj-body">
                <p className="mj-meta">
                  <span className={`${DISPLAY} mj-num`}>{String(i + 2).padStart(2, "0")}</span>
                  <span className="mj-kicker">{s.eyebrow}</span>
                  {s.place && (
                    <span className="mj-hanzi" lang="zh">
                      {s.place.hanzi}
                    </span>
                  )}
                </p>
                <h3 id={`mj-${s.key}`} className={`${DISPLAY} mj-title`}>
                  {s.title}
                </h3>
                <p className="mj-text">{s.text}</p>
                {s.place && <p className="mj-coords">{s.place.coords}</p>}
                {s.facts && (
                  <ul className="mj-chips" aria-label="At a glance">
                    {s.facts.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          </li>
        ))}

        {/* The last stop: FREE, and what it covers. */}
        <li className="mj-stop">
          <article data-mj-card className="mj-card mj-free" aria-labelledby="mj-free">
            <div className="mj-body">
              <p className="mj-meta">
                <span className={`${DISPLAY} mj-num`}>{String(STOPS.length + 2).padStart(2, "0")}</span>
                <span className="mj-kicker">{INCLUDED_EYEBROW}</span>
              </p>
              <h3 id="mj-free" className="mj-free-lockup">
                <span className={`${DISPLAY} mj-free-word`}>{FREE.word}</span>
                <span className="mj-free-sub">{FREE.sub}</span>
              </h3>
              <ul className="mj-included">
                {INCLUDED.map((item) => (
                  <li key={item.title}>
                    <span aria-hidden className="mj-tick" />
                    <span>
                      <span className={`${DISPLAY} mj-inc-title`}>{item.title}</span>
                      <span className="mj-inc-detail">{item.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mj-not">Not included: food and meals, and personal expenses.</p>
            </div>
          </article>
        </li>
      </ol>
    </section>
  );
}
