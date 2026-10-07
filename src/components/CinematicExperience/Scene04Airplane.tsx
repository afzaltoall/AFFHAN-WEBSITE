import type { CSSProperties } from "react";
import { ASSETS, PLANE_PARTS } from "./assets";
import { CAPTIONS } from "./content";
import { Caption, EYEBROW, FilmImage } from "./parts";

/**
 * 04 Airplane. The plane becomes the hero and carries the camera towards the
 * globe. It is born where the little plane printed on the boarding pass takes
 * off (03): in a flash of light (plane-bloom) at that spot, at that plane's
 * size and heading, and flies the rest of the chapter as one smooth curve
 * (animations.ts), climbing out towards the camera as the pass falls away,
 * the camera riding alongside, then pulling away past the globe. Motion blur
 * is a stretched, blurred copy of the plane behind it (plane-smear) whose
 * opacity follows the plane's speed: CSS blur has no direction, so a smear is
 * how the streak gets one.
 *
 * It flies as an airliner does at night: its engines turn (each fan face
 * softened as a spinning fan blurs, light sweeping round it), the red and
 * green navigation lights burn on the wingtips, the white strobes there
 * double-flash and the red beacon under the belly pulses. Real time, not
 * scroll, and only while the plane is on screen (data-live, animations.ts);
 * never under reduced motion (cinematic.css). Every part sits at its place in
 * the picture (PLANE_PARTS), as a percentage of it, so it moves and scales
 * with the plane. Under the caption, the climb reads out: altitude and speed
 * rising as the plane goes up, drawn from the scroll.
 */

const W = ASSETS.airplane.w;
const H = ASSETS.airplane.h;
const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(3)}%`;
const at = ([x, y]: readonly [number, number]) => ({ left: pct(x, W), top: pct(y, H) });

/** A fan face: drawn round, then turned and squashed into its ellipse, so a spin stays on the fan. */
function Fan({ fan }: { fan: (typeof PLANE_PARTS.fans)[number] }) {
  const t = (fan.deg * Math.PI) / 180;
  const dx = fan.hub[0] - fan.cx;
  const dy = fan.hub[1] - fan.cy;
  // The spinner in the fan's own round frame: unturned, then unsquashed.
  const hx = dx * Math.cos(t) + dy * Math.sin(t);
  const hy = (-dx * Math.sin(t) + dy * Math.cos(t)) * (fan.a / fan.b);
  const style = {
    ...at([fan.cx, fan.cy]),
    width: pct(2 * fan.a, W),
    "--fan-turn": `${fan.deg}deg`,
    "--fan-squash": (fan.b / fan.a).toFixed(4),
    "--hub-x": `${(50 + (hx / (2 * fan.a)) * 100).toFixed(2)}%`,
    "--hub-y": `${(50 + (hy / (2 * fan.a)) * 100).toFixed(2)}%`,
  } as CSSProperties;
  return (
    <span className="cx-fan" style={style}>
      <span className="cx-fan-blur" />
      <span className="cx-fan-spin" />
    </span>
  );
}

export function PlaneLife() {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {PLANE_PARTS.fans.map((fan) => (
        <Fan key={fan.cx} fan={fan} />
      ))}
      <span className="cx-light cx-beacon" style={at(PLANE_PARTS.beacon)} />
      <span className="cx-light cx-nav cx-nav-port" style={at(PLANE_PARTS.navPort)} />
      <span className="cx-light cx-nav cx-nav-starboard" style={at(PLANE_PARTS.navStarboard)} />
      <span className="cx-light cx-strobe" style={at(PLANE_PARTS.navPort)} />
      <span className="cx-light cx-strobe" style={at(PLANE_PARTS.navStarboard)} />
    </span>
  );
}

export function Scene04Airplane() {
  const c = CAPTIONS.plane;
  return (
    <div data-cx-scene="plane">
      {/* The take-off's flash, over the pass and the newborn plane both, so
          the little printed plane and the airliner part in light. */}
      <div
        data-cx="plane-bloom"
        data-cx-hide
        aria-hidden
        className="cx-plane-bloom pointer-events-none absolute left-1/2 top-1/2 z-[27] h-[26vmin] w-[26vmin] rounded-full"
      />
      <div className="pointer-events-none absolute inset-0 z-[26] flex items-center justify-center">
        <div data-cx="plane" data-cx-hide className="relative w-[132vw] max-w-none shrink-0 md:w-[min(60vw,106vh)]">
          <div
            data-cx="plane-smear"
            aria-hidden
            className="absolute inset-0 opacity-0"
            style={{ transform: "translate3d(-8%, 4%, 0) scaleX(1.16)", filter: "blur(10px)" }}
          >
            <FilmImage asset={ASSETS.airplane} alt="" sizes="(min-width: 768px) 60vw, 132vw" className="cx-feather-l" />
          </div>
          <FilmImage
            asset={ASSETS.airplane}
            alt="An airliner climbing, trailing gold light"
            sizes="(min-width: 768px) 60vw, 132vw"
            className="cx-feather-l relative"
          />
          <PlaneLife />
        </div>
      </div>
      <Caption
        cx="cap-plane"
        eyebrow={c.eyebrow}
        title={c.title}
        className="left-6 top-[max(14svh,5rem)] md:left-[6vw] md:top-[max(16svh,5rem)]"
      >
        {/* The climb, read out (animations.ts writes the figures). Decorative. */}
        <div data-cx-part="hud" aria-hidden className="mt-5 flex gap-8 md:mt-7 md:gap-11">
          {[
            { label: c.altitude, key: "plane-alt", start: "0", unit: c.ft },
            { label: c.speed, key: "plane-speed", start: "290", unit: c.kmh },
          ].map((r) => (
            <p key={r.key} className="flex flex-col gap-1.5">
              <span className={EYEBROW}>{r.label}</span>
              <span className="text-[clamp(20px,1.9vw,28px)] font-semibold tabular-nums tracking-[0.04em] text-(--cx-white)">
                <span data-cx={r.key}>{r.start}</span>
                <span className="ml-1.5 text-[0.55em] font-semibold uppercase tracking-[0.2em] text-(--cx-white)/60">{r.unit}</span>
              </span>
            </p>
          ))}
        </div>
      </Caption>
    </div>
  );
}
