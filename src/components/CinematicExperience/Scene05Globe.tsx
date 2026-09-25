import { ANCHORS, ASSETS } from "./assets";
import { CAPTIONS } from "./content";
import { Caption, FilmImage } from "./parts";

/**
 * 05 Globe. One gold route, India to China, drawn over the globe as you scroll.
 *
 * The route lives in the globe's own coordinate space (an SVG with the
 * picture's viewBox), so it turns and scales with the globe. It is drawn with
 * opacity and transforms only: dots light in order along a curve, a bright
 * head travels them, and the two ends pulse. (The artwork already carries
 * faint lines out of China; this is the only route that moves or is named.)
 */

const VB = { w: ASSETS.globe.w, h: ASSETS.globe.h };
const A = { x: ANCHORS.globeIndia.x * VB.w, y: ANCHORS.globeIndia.y * VB.h };
const B = { x: ANCHORS.globeChina.x * VB.w, y: ANCHORS.globeChina.y * VB.h };
/** The control point lifts the curve into an arc, like a flight path. */
const C = { x: (A.x + B.x) / 2 - 30, y: Math.min(A.y, B.y) - 150 };

const at = (t: number) => ({
  x: (1 - t) * (1 - t) * A.x + 2 * (1 - t) * t * C.x + t * t * B.x,
  y: (1 - t) * (1 - t) * A.y + 2 * (1 - t) * t * C.y + t * t * B.y,
});

/** Points along the route, shared with animations.ts for the travelling head. */
export const ROUTE_POINTS = Array.from({ length: 26 }, (_, i) => at(i / 25));

export function Scene05Globe() {
  return (
    <div data-cx-scene="globe">
      <div className="pointer-events-none absolute inset-0 z-[22] flex items-center justify-center">
        <div data-cx="globe" data-cx-hide className="relative w-[112vw] max-w-none shrink-0 md:w-[min(50vw,86vh)]">
          <FilmImage
            asset={ASSETS.globe}
            alt="The globe, with a gold route from India to China"
            sizes="(min-width: 768px) 50vw, 112vw"
          />
          <svg viewBox={`0 0 ${VB.w} ${VB.h}`} aria-hidden className="absolute inset-0 h-full w-full overflow-visible">
            <defs>
              <radialGradient id="cx-route-glow">
                <stop offset="0" stopColor="#fff4d6" stopOpacity="0.95" />
                <stop offset="0.35" stopColor="#f2d38e" stopOpacity="0.55" />
                <stop offset="1" stopColor="#d6a84e" stopOpacity="0" />
              </radialGradient>
            </defs>
            <path
              d={`M${A.x} ${A.y} Q${C.x} ${C.y} ${B.x} ${B.y}`}
              fill="none"
              stroke="rgb(242 211 142 / 0.16)"
              strokeWidth={3}
              strokeLinecap="round"
            />
            {ROUTE_POINTS.slice(1, -1).map((p, i) => (
              <circle key={i} data-cx="route-dot" cx={p.x} cy={p.y} r={5} fill="#f2d38e" opacity={0} />
            ))}
            {[A, B].map((p, i) => (
              <g key={i} data-cx={i === 0 ? "route-end-a" : "route-end-b"} opacity={0}>
                <circle cx={p.x} cy={p.y} r={46} fill="url(#cx-route-glow)" />
                <circle cx={p.x} cy={p.y} r={11} fill="#fff4d6" />
                <circle cx={p.x} cy={p.y} r={24} fill="none" stroke="#f2d38e" strokeWidth={2.5} opacity={0.8} />
              </g>
            ))}
            <g data-cx="route-head" opacity={0}>
              <circle r={40} fill="url(#cx-route-glow)" />
              <circle r={9} fill="#ffffff" />
            </g>
          </svg>
          <span
            data-cx="route-label-a"
            data-cx-hide
            className="absolute right-[67%] top-[44%] -translate-y-1/2 whitespace-nowrap text-[clamp(10px,1.3vw,17px)] font-semibold uppercase tracking-[0.3em] text-(--cx-gold-hi)"
          >
            {CAPTIONS.globe.from}
          </span>
          <span
            data-cx="route-label-b"
            data-cx-hide
            className="absolute left-[64%] top-[31%] -translate-y-[160%] whitespace-nowrap text-[clamp(10px,1.3vw,17px)] font-semibold uppercase tracking-[0.3em] text-(--cx-gold-hi)"
          >
            {CAPTIONS.globe.to}
          </span>
        </div>
      </div>
      <Caption
        cx="cap-globe"
        eyebrow={CAPTIONS.globe.eyebrow}
        title={CAPTIONS.globe.title}
        className="bottom-[8svh] left-6 md:bottom-[11svh] md:left-[6vw]"
      />
    </div>
  );
}
