"use client";

import { useEffect, useRef } from "react";
import { ASSETS, srcSetOf } from "@/components/CinematicExperience/assets";
import { PlaneLife } from "@/components/CinematicExperience/Scene04Airplane";

const W = ASSETS.airplane.w;
const H = ASSETS.airplane.h;
const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;
/**
 * The window seats just behind the forward door, front to back: their middles
 * in the picture (04-airplane, 1600 x 900), found from its pixels (the dark
 * windows on the white fuselage, 2026-10-07). The first `lit` are lit.
 */
const WINDOWS: readonly (readonly [number, number])[] = [
  [1189.5, 247.9],
  [1169.2, 259.1],
  [1149.2, 269.5],
  [1129.4, 280.3],
  [1110.2, 290.8],
];
/** The note's leader: from the note to just above the lit windows, in the picture's own pixels. */
const LEADER = "M 925 128 L 1086 128 L 1136 226";

/**
 * The five places as the aircraft that will fly the winners to China: the
 * film's own airliner (04-airplane, as in Scene04Airplane), climbing out
 * trailing gold light, with `lit` of its window seats lit from inside, warm,
 * and a note pointing to them ("Five seats, still to be drawn"). It is alive
 * as it is in the film: its engines turn, its wingtip lights burn, the
 * strobes double-flash and the belly beacon pulses (PlaneLife, under
 * [data-live] while it is in view). The first time it is seen it flies in;
 * then it rides the air, and a light passes from one lit window to the next.
 *
 * Each window's light is a warm glow blended as screen: on the dark glass it
 * shows, on the white fuselage it barely does, so only the windows light up.
 * Under reduced motion it is in place and still (registered.css, cinematic.css).
 * One picture for screen readers (`label`).
 */
export function FlightSeats({ lit, label, note }: { lit: number; label: string; note: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const seen = new IntersectionObserver(
      (entries) => {
        const on = entries.some((e) => e.isIntersecting);
        if (on) {
          el.setAttribute("data-live", "");
          el.classList.add("is-arrived");
        } else el.removeAttribute("data-live");
      },
      { threshold: 0.3 },
    );
    seen.observe(el);
    return () => seen.disconnect();
  }, []);
  return (
    <figure ref={ref} className="tr-fs" role="img" aria-label={label}>
      <div className="tr-fs-fly">
        <div className="tr-fs-plane">
          {/* The film's own files, its phone copy on a phone; not FilmImage, which waits for the film's loader. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ASSETS.airplane.src}
            srcSet={srcSetOf(ASSETS.airplane)}
            sizes="(min-width: 1024px) 52vw, 100vw"
            width={W}
            height={H}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="cx-feather-l tr-fs-image"
          />
          {WINDOWS.slice(0, lit).map(([x, y], i) => (
            <span key={x} aria-hidden className="tr-fs-window" style={{ left: pct(x, W), top: pct(y, H), ["--i" as string]: i }}>
              <span className="tr-fs-halo" />
              <span className="tr-fs-pane" />
            </span>
          ))}
          <PlaneLife />
          <svg aria-hidden className="tr-fs-leader" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <path d={LEADER} fill="none" vectorEffect="non-scaling-stroke" />
            <circle cx="1136" cy="226" r="5" />
          </svg>
          <span aria-hidden className="tr-fs-note" style={{ right: pct(W - 925, W), top: pct(128, H) }}>
            {note}
          </span>
        </div>
      </div>
    </figure>
  );
}
