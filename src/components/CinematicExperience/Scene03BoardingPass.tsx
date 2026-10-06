import { ANCHORS, ASSETS, PASS_PLANE } from "./assets";
import { CAPTIONS } from "./content";
import { Caption, FilmImage } from "./parts";

/**
 * 03 Boarding pass. Becomes the foreground hero with a little rotation and
 * perspective, a light sweep across the paper, and a slow float. The sweep is
 * masked by the pass's own picture (cx-mask-boarding), so light only lands on
 * the tickets, never on the dark around them.
 *
 * Then the pass comes alive: the camera moves in on its route, and the little
 * plane printed on it, halfway from IND (Chennai) to CHN (Guangzhou), lifts
 * off the paper and flies on towards CHN, gathering speed, the route turning
 * gold behind it. It does not stop at the dot before CHN: it takes off there,
 * climbing off the paper into a flash of light as the dot catches it, and the
 * real airliner is born in that light, where the little one is, its size and
 * heading its way, and carries the same flight on (04). One plane, one
 * flight, never two on screen.
 *
 * Three layers over the picture, all in its own coordinates (an SVG with the
 * picture's viewBox), so they turn and scale with it:
 *  - paper: where the plane was printed, with the dashes it covered, shown
 *    the moment the plane leaves;
 *  - gold: the route, multiplied into the paper, so the printed dashes stay
 *    black on it as if it were inked under the print;
 *  - the plane itself (PASS_PLANE, lifted off the picture, so it is the print
 *    and not a drawing of it), its shadow while it is airborne, and the dot
 *    and its ring of light where it takes off.
 * All hidden until the film draws them, so the reduced-motion film shows the
 * pass as printed.
 *
 * NOTE: the artwork prints a flight number (CA528), a date (1 DEC 2026), a
 * gate and a seat. They are part of the flattened image and cannot be
 * removed here; see README.md.
 */

const VB = { w: ASSETS.boardingPass.w, h: ASSETS.boardingPass.h };
const pt = (a: { x: number; y: number }) => ({ x: a.x * VB.w, y: a.y * VB.h });
const FROM = pt(ANCHORS.passRouteFrom);
const PLANE = pt(ANCHORS.passPlane);
const DOT = pt(ANCHORS.passRouteDot);
const ANGLE = Math.atan2(DOT.y - FROM.y, DOT.x - FROM.x);
const DEG = (ANGLE * 180) / Math.PI;
const DIR = { x: Math.cos(ANGLE), y: Math.sin(ANGLE) };

/** The printed plane's nose is 56px into its box; it takes off 4px short of the dot's edge. */
const NOSE = PASS_PLANE.x + 56;
const DOT_R = 4;
const FLIGHT = (DOT.x - DOT_R - 4 - NOSE) / DIR.x;
/** Along the route: from its start to the printed plane, and to where the plane takes off. */
const TO_PLANE = Math.hypot(PLANE.x - FROM.x, PLANE.y - FROM.y);
const INK = TO_PLANE + FLIGHT;

/** Five dashes under the printed plane, spaced like the ones either side of it. */
const GAP_DASHES = [554, 566, 578, 590, 602].map((x) => ({ x, y: FROM.y + (x - FROM.x) * Math.tan(ANGLE) }));

/**
 * What animations.ts needs: the flight as a translation, how much of the gold
 * is the half already flown, and the take-off, where the airliner is born:
 * the printed plane's fuselage there (its middle, as fractions of the
 * picture, and its length, as a fraction of the picture's width) and its
 * heading on the paper, in degrees.
 */
export const PASS_ROUTE = {
  flight: { x: FLIGHT * DIR.x, y: FLIGHT * DIR.y },
  flownShare: TO_PLANE / INK,
  takeoff: {
    x: (PASS_PLANE.x + PASS_PLANE.body.x + FLIGHT * DIR.x) / VB.w,
    y: (PASS_PLANE.y + PASS_PLANE.body.y + FLIGHT * DIR.y) / VB.h,
    length: PASS_PLANE.body.length / VB.w,
    heading: DEG,
  },
} as const;

const layer = "pointer-events-none absolute inset-0 h-full w-full overflow-visible";

export function Scene03BoardingPass() {
  return (
    <div data-cx-scene="boarding">
      <div className="pointer-events-none absolute inset-0 z-[24] flex items-center justify-center">
        <div data-cx="boarding" data-cx-hide className="relative w-[128vw] max-w-none shrink-0 md:w-[min(62vw,110vh)]">
          <FilmImage
            asset={ASSETS.boardingPass}
            alt="Two boarding passes from India to China"
            sizes="(min-width: 768px) 62vw, 128vw"
          />

          {/* Paper where the plane was printed, and the dashes it covered. Its
              edge is feathered into the real paper, so the two copies of the
              picture (their paper differs by a level or two) both take it. */}
          <svg viewBox={`0 0 ${VB.w} ${VB.h}`} aria-hidden className={layer}>
            <defs>
              <filter id="cx-pass-feather" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="1.4" />
              </filter>
            </defs>
            <g data-cx="pass-gap" opacity={0}>
              <rect
                x={PASS_PLANE.x - 3}
                y={PASS_PLANE.y - 3}
                width={PASS_PLANE.w + 6}
                height={PASS_PLANE.h + 6}
                fill={PASS_PLANE.paper}
                filter="url(#cx-pass-feather)"
              />
              {GAP_DASHES.map((p) => (
                <rect key={p.x} x={-3.5} y={-1.3} width={7} height={2.6} fill="#0b0b0b" transform={`translate(${p.x} ${p.y}) rotate(${DEG})`} />
              ))}
            </g>
          </svg>

          {/* The route turning gold, inked under the print. */}
          <svg viewBox={`0 0 ${VB.w} ${VB.h}`} aria-hidden className={`${layer} mix-blend-multiply`}>
            <defs>
              <linearGradient id="cx-pass-ink" gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={INK} y2={0}>
                <stop offset="0" stopColor="#ad7e2b" />
                <stop offset="1" stopColor="#d6a84e" />
              </linearGradient>
              <filter id="cx-pass-soft" x="-10%" y="-300%" width="120%" height="700%">
                <feGaussianBlur stdDeviation="3.4" />
              </filter>
            </defs>
            <g transform={`translate(${FROM.x} ${FROM.y}) rotate(${DEG})`}>
              <g data-cx="pass-ink" opacity={0}>
                <rect x={0} y={-8} width={INK} height={16} fill="#f2d38e" opacity={0.5} filter="url(#cx-pass-soft)" />
                <rect x={0} y={-2.3} width={INK} height={4.6} rx={2.3} fill="url(#cx-pass-ink)" />
              </g>
            </g>
          </svg>

          {/* The plane, airborne, and its take-off at the dot before CHN. */}
          <svg viewBox={`0 0 ${VB.w} ${VB.h}`} aria-hidden className={layer}>
            <defs>
              <filter id="cx-pass-shadow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur in="SourceAlpha" stdDeviation="2.4" result="blur" />
                <feOffset in="blur" dx="3" dy="5" result="drop" />
                <feFlood floodColor="#2a1a06" floodOpacity="0.5" />
                <feComposite in2="drop" operator="in" />
              </filter>
              <radialGradient id="cx-pass-dot">
                <stop offset="0" stopColor="#ffe6a6" />
                <stop offset="0.55" stopColor="#e0b357" />
                <stop offset="1" stopColor="#a87a2a" />
              </radialGradient>
            </defs>
            <circle data-cx="pass-ring" cx={DOT.x} cy={DOT.y} r={15} fill="none" stroke="#c9973f" strokeWidth={1.6} opacity={0} />
            <circle data-cx="pass-dot" cx={DOT.x} cy={DOT.y} r={DOT_R + 1} fill="url(#cx-pass-dot)" opacity={0} />
            <g data-cx="pass-plane" opacity={0}>
              <g data-cx="pass-plane-lift">
                <image
                  data-cx="pass-plane-shadow"
                  href={PASS_PLANE.src}
                  x={PASS_PLANE.x}
                  y={PASS_PLANE.y}
                  width={PASS_PLANE.w}
                  height={PASS_PLANE.h}
                  filter="url(#cx-pass-shadow)"
                  opacity={0}
                />
                <image href={PASS_PLANE.src} x={PASS_PLANE.x} y={PASS_PLANE.y} width={PASS_PLANE.w} height={PASS_PLANE.h} />
              </g>
            </g>
          </svg>

          <div aria-hidden className="cx-mask-boarding absolute inset-0 overflow-hidden">
            <div data-cx="boarding-sweep" className="cx-sweep absolute inset-0" />
          </div>
        </div>
      </div>
      {/* At the top, where the flight's caption follows it: at the foot the
          plane climbed in through it (the owner's request, 2026-10-05). */}
      <Caption
        cx="cap-boarding"
        eyebrow={CAPTIONS.boarding.eyebrow}
        title={CAPTIONS.boarding.title}
        className="left-6 top-[max(14svh,5rem)] md:left-[6vw] md:top-[max(16svh,5rem)]"
      />
    </div>
  );
}
