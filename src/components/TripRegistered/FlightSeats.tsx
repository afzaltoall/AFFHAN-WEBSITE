import { useId, type ReactNode } from "react";

/** The windows along the fuselage, front to back: their left edges. The first `lit` of them are lit. */
const WINDOWS = [500, 460, 420, 380, 340, 300, 260, 220, 180, 140, 100, 60, 20];
/** Clouds, each a few soft puffs heaped up from a flat foot: x, y of its foot's middle, its size. Drawn
    twice, side by side, so they loop. */
const BACK_CLOUDS: [number, number, number][] = [
  [70, 226, 26], [250, 236, 34], [430, 222, 24], [590, 234, 30],
];
const FRONT_CLOUDS: [number, number, number][] = [
  [140, 250, 40], [480, 254, 44],
];
const HIGH_CLOUDS: [number, number, number][] = [
  [180, 44, 14], [520, 30, 12],
];
/** One cloud's puffs, from its foot (x, y) and size: across, up, and how large. */
const PUFFS: [number, number, number][] = [
  [-1.15, -0.1, 0.62], [-0.45, -0.45, 0.82], [0.35, -0.3, 0.72], [1.05, -0.05, 0.55], [0, 0.12, 1.15],
];

/**
 * The five places as the aircraft that will fly the winners to China, in a
 * close view of its front: gold line on the night, flying over moving
 * clouds, `lit` windows lit and empty (a seat back in each), the rest dark.
 * It comes out of the dark on the left; a light passes from one lit window
 * to the next; it rides the air a little; its beacon blinks; a sheen runs
 * along it now and then. Under reduced motion it is still (registered.css).
 * One picture for screen readers (`label`).
 */
export function FlightSeats({ lit, label }: { lit: number; label: string }) {
  const id = useId().replace(/:/g, "");
  const u = (name: string) => `url(#${name}-${id})`;
  const cloud = (set: [number, number, number][], dx: number) =>
    set.map(([x, y, s], i) => (
      <g key={`${dx}-${i}`}>
        {PUFFS.map(([px, py, pr], j) => (
          <ellipse key={j} cx={x + dx + px * s} cy={y + py * s} rx={pr * s * (j === 4 ? 1.6 : 1)} ry={pr * s * (j === 4 ? 0.45 : 1)} fill={u("puff")} />
        ))}
      </g>
    ));
  // The sky's edges fade on every side, so the clouds never end at the picture's edge.
  const sky = (children: ReactNode, className: string) => (
    <g mask={u("sky-x")}>
      <g mask={u("sky-y")}>
        <g className={`tr-fs-clouds ${className}`}>{children}</g>
      </g>
    </g>
  );
  const body = "M -40 80 L 520 80 C 576 80 628 94 652 113 C 664 123 664 134 650 141 C 626 152 584 156 540 156 L -40 156 Z";
  return (
    <svg className="tr-fs" viewBox="0 0 680 250" role="img" aria-label={label}>
      <defs>
        <linearGradient id={`body-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2c2329" />
          <stop offset="0.55" stopColor="#17121a" />
          <stop offset="1" stopColor="#0c090e" />
        </linearGradient>
        <linearGradient id={`edge-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8a6424" />
          <stop offset="0.6" stopColor="#e6c06a" />
          <stop offset="1" stopColor="#fff0c4" />
        </linearGradient>
        <linearGradient id={`stripe-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d6a84e" stopOpacity="0.2" />
          <stop offset="0.7" stopColor="#f2d38e" />
          <stop offset="1" stopColor="#f2d38e" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`pane-${id}`} cx="0.5" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#fff8e2" />
          <stop offset="0.55" stopColor="#f6d891" />
          <stop offset="1" stopColor="#c8923a" />
        </radialGradient>
        <radialGradient id={`halo-${id}`}>
          <stop offset="0" stopColor="#ffe3a0" stopOpacity="0.75" />
          <stop offset="1" stopColor="#ffe3a0" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`puff-${id}`}>
          <stop offset="0" stopColor="#f4e6c8" stopOpacity="0.17" />
          <stop offset="0.65" stopColor="#f4e6c8" stopOpacity="0.085" />
          <stop offset="1" stopColor="#f4e6c8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`trail-${id}`} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#f2d38e" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f2d38e" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`sheen-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff4d6" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff4d6" stopOpacity="0.22" />
          <stop offset="1" stopColor="#fff4d6" stopOpacity="0" />
        </linearGradient>
        {/* Out of the dark on the left. */}
        <linearGradient id={`fade-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" />
          <stop offset="0.28" stopColor="#fff" />
        </linearGradient>
        <mask id={`mask-${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="680" height="250">
          <rect width="680" height="250" fill={u("fade")} />
        </mask>
        <linearGradient id={`sky-x-grad-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" />
          <stop offset="0.22" stopColor="#fff" />
          <stop offset="0.8" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <linearGradient id={`sky-y-grad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" />
          <stop offset="0.12" stopColor="#fff" />
          <stop offset="0.78" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id={`sky-x-${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="680" height="250">
          <rect width="680" height="250" fill={u("sky-x-grad")} />
        </mask>
        <mask id={`sky-y-${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="680" height="250">
          <rect width="680" height="250" fill={u("sky-y-grad")} />
        </mask>
        <clipPath id={`hull-${id}`}>
          <path d={body} />
        </clipPath>
      </defs>

      {sky(
        <>
          {cloud(HIGH_CLOUDS, 0)}
          {cloud(HIGH_CLOUDS, 680)}
        </>,
        "tr-fs-high",
      )}
      {sky(
        <>
          {cloud(BACK_CLOUDS, 0)}
          {cloud(BACK_CLOUDS, 680)}
        </>,
        "tr-fs-back",
      )}

      <g mask={u("mask")}>
        <g className="tr-fs-plane">
          {/* The trail behind the engine. */}
          <path className="tr-fs-trail" d="M 172 180 L -40 186" stroke={u("trail")} strokeWidth="3" strokeLinecap="round" fill="none" />
          {/* The near wing, swept back and down, and its engine. */}
          <path d="M 268 150 L 150 150 L 26 246 L 96 246 Z" fill={u("body")} stroke={u("edge")} strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M 268 150 L 96 246" stroke="#f2d38e" strokeOpacity="0.55" strokeWidth="1.2" />
          <path d="M 214 160 L 236 160 L 244 170 L 206 170 Z" fill={u("body")} stroke={u("edge")} strokeWidth="1" />
          <rect x="166" y="168" width="108" height="30" rx="15" fill={u("body")} stroke={u("edge")} strokeWidth="1.4" />
          <ellipse cx="272" cy="183" rx="6" ry="14" fill="#0b090d" stroke="#f2d38e" strokeWidth="1.4" />
          <path d="M 180 172 L 262 172" stroke="#fff0c4" strokeOpacity="0.3" strokeWidth="1" />

          {/* The fuselage, its light along the top, its stripe, the door, the cockpit. */}
          <path d={body} fill={u("body")} stroke={u("edge")} strokeWidth="1.6" />
          <path d="M -40 82 L 520 82" stroke="#fff0c4" strokeOpacity="0.3" strokeWidth="1" />
          <path d="M -40 132 L 560 132 C 592 132 618 135 640 139" stroke={u("stripe")} strokeWidth="2.6" fill="none" />
          <rect x="540" y="92" width="22" height="52" rx="7" fill="none" stroke="#f2d38e" strokeOpacity="0.5" strokeWidth="1" />
          <path d="M 584 97 L 606 100 L 608 111 L 584 109 Z" fill="#0b090d" stroke="#f2d38e" strokeWidth="1.1" strokeLinejoin="round" />
          <path d="M 613 102 L 632 109 L 632 118 L 613 113 Z" fill="#0b090d" stroke="#f2d38e" strokeWidth="1.1" strokeLinejoin="round" />

          {/* The windows: the first `lit` lit and empty, a seat back in each; the rest dark. */}
          {WINDOWS.map((x, i) =>
            i < lit ? (
              <g key={x}>
                <ellipse className="tr-fs-halo" style={{ ["--i" as string]: i }} cx={x + 8} cy={108} rx={26} ry={30} fill={u("halo")} />
                <rect x={x} y={96} width={16} height={24} rx={8} fill={u("pane")} stroke="#fff0c4" strokeWidth="1.2" />
                <rect x={x + 3.5} y={109} width={9} height={11} rx={3} fill="#5b3d12" fillOpacity="0.55" />
              </g>
            ) : (
              <rect key={x} x={x} y={96} width={16} height={24} rx={8} fill="#0b090d" stroke="#f2d38e" strokeOpacity="0.45" strokeWidth="1" />
            ),
          )}

          {/* A sheen along it now and then, and its beacon. */}
          <g clipPath={u("hull")}>
            <rect className="tr-fs-sheen" x="-160" y="70" width="140" height="100" fill={u("sheen")} />
          </g>
          <circle className="tr-fs-beacon" cx="300" cy="78" r="2.6" fill="#ff5a5a" />
        </g>
      </g>

      {sky(
        <>
          {cloud(FRONT_CLOUDS, 0)}
          {cloud(FRONT_CLOUDS, 680)}
        </>,
        "tr-fs-front",
      )}
    </svg>
  );
}
