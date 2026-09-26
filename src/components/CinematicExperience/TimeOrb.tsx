/**
 * The opener's clock, which becomes an orbit. Drawn in code (SVG), no image.
 *
 * Meant to read as an instrument, not a watch face or a loading spinner: a
 * hairline bezel with 120 fine divisions, the twelve majors carrying small
 * bearing numerals (000–330) like a navigator's compass ring, one long
 * needle, and a jewelled centre. No numerals 1–12, no second hand, no
 * progress arc.
 *
 * Built as nested layers so the choreography can do two things at once:
 *   op-orb       tilts (rotationX): the face-on clock becomes a flat ellipse,
 *                the orbit, seen edge-on;
 *   op-orb-spin  spins in the ring's own plane: the bright part of the ring's
 *                gradient travels round, which is the light sweep.
 * The ring is drawn twice. The back copy (with ticks and needle) sits behind
 * the globe; the front copy is masked to the half nearest the viewer and sits
 * in front of it, so the orbit passes behind the globe and in front of it.
 *
 * The spark is where everything starts: a single gold point, breathing.
 */

const TICKS = Array.from({ length: 120 }, (_, i) => {
  const a = (i * 3 * Math.PI) / 180;
  const major = i % 10 === 0;
  const r1 = major ? 82.5 : 88.5;
  const r2 = 91;
  return {
    x1: Math.sin(a) * r1,
    y1: -Math.cos(a) * r1,
    x2: Math.sin(a) * r2,
    y2: -Math.cos(a) * r2,
    major,
    label: major ? String(i * 3).padStart(3, "0") : null,
    lx: Math.sin(a) * 76,
    ly: -Math.cos(a) * 76,
  };
});

function Ring({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-sweep`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d6a84e" stopOpacity="0.18" />
          <stop offset="0.55" stopColor="#d6a84e" stopOpacity="0.55" />
          <stop offset="0.82" stopColor="#fff4d6" stopOpacity="1" />
          <stop offset="1" stopColor="#f2d38e" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <circle r="92" fill="none" stroke={`url(#${id}-sweep)`} strokeWidth="0.7" />
      <circle r="94.5" fill="none" stroke="#d6a84e" strokeOpacity="0.14" strokeWidth="0.25" />
    </>
  );
}

export function TimeOrb() {
  return (
    <>
      {/* The spark, and the glow the world later grows out of. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center">
        <div data-cx="op-core" data-cx-hide className="cx-core-glow h-[min(34vh,48vw)] w-[min(34vh,48vw)] shrink-0 rounded-full" />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[26] flex items-center justify-center">
        <div data-cx="op-spark" className="relative h-3 w-3 shrink-0">
          <span className="cx-spark absolute inset-0 rounded-full" />
        </div>
      </div>

      {/* The back ring: bezel, divisions, bearings and needle. Behind the globe. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[21] flex items-center justify-center">
        <div data-cx="op-orb" data-cx-hide className="relative aspect-square w-[min(58vh,80vw)] shrink-0">
          <div data-cx="op-orb-spin" className="absolute inset-0">
            <svg viewBox="-100 -100 200 200" className="h-full w-full overflow-visible">
              <Ring id="cx-orb-back" />
              <circle r="86" fill="none" stroke="#d6a84e" strokeOpacity="0.1" strokeWidth="0.3" />
            </svg>
          </div>
          <svg data-cx="op-ticks" viewBox="-100 -100 200 200" className="absolute inset-0 h-full w-full overflow-visible">
            {TICKS.map((t, i) => (
              <line
                key={i}
                x1={t.x1.toFixed(2)}
                y1={t.y1.toFixed(2)}
                x2={t.x2.toFixed(2)}
                y2={t.y2.toFixed(2)}
                stroke="#f2d38e"
                strokeOpacity={t.major ? 0.8 : 0.32}
                strokeWidth={t.major ? 0.7 : 0.25}
              />
            ))}
            {TICKS.filter((t) => t.label).map((t) => (
              <text
                key={t.label}
                x={t.lx.toFixed(2)}
                y={t.ly.toFixed(2)}
                fill="#f2d38e"
                fillOpacity="0.55"
                fontSize="3.4"
                letterSpacing="0.6"
                textAnchor="middle"
                dominantBaseline="middle"
                className="tabular-nums"
              >
                {t.label}
              </text>
            ))}
          </svg>
          <div data-cx="op-hand" data-cx-hide className="absolute inset-0">
            <svg viewBox="-100 -100 200 200" className="h-full w-full overflow-visible">
              <defs>
                <linearGradient id="cx-hand" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0" stopColor="#8e6a26" />
                  <stop offset="0.55" stopColor="#f2d38e" />
                  <stop offset="1" stopColor="#fff4d6" />
                </linearGradient>
              </defs>
              {/* The needle, its counterweight, and the jewel it turns on. */}
              <polygon points="-0.7,14 0.7,14 0.22,-80 -0.22,-80" fill="url(#cx-hand)" />
              <circle cy="12" r="2.2" fill="none" stroke="#f2d38e" strokeWidth="0.5" />
              <circle r="2.6" fill="#fff4d6" />
              <circle r="4.2" fill="none" stroke="#f2d38e" strokeOpacity="0.6" strokeWidth="0.4" />
            </svg>
          </div>
        </div>
      </div>

      {/* The front ring: the near half of the orbit only, in front of the globe. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[24] flex items-center justify-center">
        <div data-cx="op-orb-front" data-cx-hide className="relative aspect-square w-[min(58vh,80vw)] shrink-0">
          <div className="cx-orb-near absolute inset-0">
            <div data-cx="op-orb-spin" className="absolute inset-0">
              <svg viewBox="-100 -100 200 200" className="h-full w-full overflow-visible">
                <Ring id="cx-orb-front" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
