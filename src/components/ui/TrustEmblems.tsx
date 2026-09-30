/**
 * The three emblems of the hero's stats row (TrustBadges.tsx): a verified
 * seal, a parcel and a globe with a route on it.
 *
 * Drawn here rather than taken from an icon set. The row sat under a 3D globe
 * in the badge above it and between the Full Catalog and Top Ranking pills
 * with their rendered icons, and it was the one place in the hero still using
 * thin 18px line icons in slate — the weakest marks on the screen, on the row
 * the page most needs believed. These are lit from the top left like those
 * renders, in the site's blues (hue ~191) with the gold of Top Ranking's
 * laurel for the tape and the route.
 *
 * Each is a 48-unit square with its motion parts named by class; the motion
 * itself is CSS (globals.css, "Hero stats row"), so nothing here runs script.
 * Gradient ids are prefixed with `id` because inline SVG ids are page-global.
 */

type EmblemProps = { id: string };

/** "500+ Verified": a rosette seal with a check. The rosette is three rounded
 *  squares turned 30° apart, twelve points in all, so a turn of 30° looks the
 *  same as none and the seal can be spun without a seam. Its fill is a radial
 *  gradient centred on the turn for the same reason; the light that does not
 *  turn (the face, the gloss) is drawn separately on top. */
export function SealEmblem({ id }: EmblemProps) {
  const u = (s: string) => `url(#${id}-${s})`;
  const square = { x: 9.6, y: 9.6, width: 28.8, height: 28.8, rx: 6.5 };
  return (
    <svg viewBox="0 0 48 48" className="tb-art" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-body`} cx="24" cy="24" r="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#46c3dd" />
          <stop offset="0.7" stopColor="#2aa6c2" />
          <stop offset="1" stopColor="#1b7d95" />
        </radialGradient>
        <linearGradient id={`${id}-rim`} x1="14" y1="13" x2="34" y2="35" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e9fbff" />
          <stop offset="1" stopColor="#1a6f84" />
        </linearGradient>
        <linearGradient id={`${id}-face`} x1="15" y1="14" x2="33" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#176a80" />
          <stop offset="1" stopColor="#239bb6" />
        </linearGradient>
        <linearGradient id={`${id}-gloss`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.6" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <rect {...square} />
          <rect {...square} transform="rotate(30 24 24)" />
          <rect {...square} transform="rotate(60 24 24)" />
        </clipPath>
      </defs>
      <g className="tb-seal-badge">
        <rect {...square} fill={u("body")} />
        <rect {...square} fill={u("body")} transform="rotate(30 24 24)" />
        <rect {...square} fill={u("body")} transform="rotate(60 24 24)" />
      </g>
      <circle cx="24" cy="24" r="13" fill={u("face")} stroke={u("rim")} strokeWidth="1.6" />
      <path
        className="tb-seal-check"
        d="M18.3 24.6 L22.3 28.6 L30.1 20.3"
        pathLength={1}
        fill="none"
        stroke="#fff"
        strokeWidth="3.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.5 21 C 12 9, 36 9, 39.5 21 C 31 16.5, 17 16.5, 8.5 21 Z" fill={u("gloss")} opacity="0.75" />
      {/* A glint that crosses the seal when it turns; parked off it at rest. */}
      <g clipPath={u("clip")}>
        <g transform="skewX(-20)">
          <rect className="tb-seal-shine" x="-2" y="0" width="9" height="48" fill={u("shine")} />
        </g>
      </g>
    </svg>
  );
}

/** "10 Lakhs+ Products": a parcel, taped and labelled, in isometric view. It
 *  stands on a soft shadow of its own, which shrinks when the parcel hops. */
export function ParcelEmblem({ id }: EmblemProps) {
  const u = (s: string) => `url(#${id}-${s})`;
  return (
    <svg viewBox="0 0 48 48" className="tb-art" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-top`} x1="10" y1="9" x2="36" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d6f5fc" />
          <stop offset="1" stopColor="#8ed8ea" />
        </linearGradient>
        <linearGradient id={`${id}-left`} x1="7" y1="18" x2="24" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3dbcd7" />
          <stop offset="1" stopColor="#2297b3" />
        </linearGradient>
        <linearGradient id={`${id}-right`} x1="24" y1="18" x2="41" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1d7d95" />
          <stop offset="1" stopColor="#135a6c" />
        </linearGradient>
        <radialGradient id={`${id}-shadow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#10505f" stopOpacity="0.3" />
          <stop offset="1" stopColor="#10505f" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse className="tb-parcel-shadow" cx="24" cy="40.5" rx="17" ry="5" fill={u("shadow")} />
      <g className="tb-parcel-box">
        <polygon points="24,7 41,15.5 24,24 7,15.5" fill={u("top")} />
        <polygon points="7,15.5 24,24 24,42 7,33.5" fill={u("left")} />
        <polygon points="24,24 41,15.5 41,33.5 24,42" fill={u("right")} />
        {/* The tape, over the lid and down the right face. */}
        <polygon points="14.1,11.9 16.9,10.6 33.9,19.1 31.1,20.4" fill="#f7cf63" />
        <polygon points="31.1,20.4 33.9,19.1 33.9,37.1 31.1,38.4" fill="#d69a2e" />
        {/* The shipping label, on the left face. */}
        <polygon points="10.2,23.2 18,27.1 18,33.4 10.2,29.5" fill="#fff" opacity="0.94" />
        <path
          d="M11.6 25.9 L16.6 28.4 M11.6 28.1 L15 29.8"
          stroke="#176579"
          strokeOpacity="0.55"
          strokeWidth="0.9"
          strokeLinecap="round"
        />
        {/* The lit edges. */}
        <path
          d="M7 15.5 L24 24 L41 15.5 M24 24 L24 42"
          fill="none"
          stroke="#fff"
          strokeOpacity="0.7"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** Meridians of the globe, as horizontal scales of one circle. Three great
 *  circles at 20°, 80° and 140°, so no two project onto the same ellipse at
 *  rest. A spin turns each on by 60° (the "m" value is the halfway point, so
 *  the scale follows the cosine rather than a straight line), and the three
 *  end where the set began, one place along: the spin has no seam either.
 *  A negative scale draws the same ellipse as a positive one. */
const MERIDIANS = [
  { a: 0.94, m: 0.643, b: 0.174 },
  { a: 0.174, m: -0.342, b: -0.766 },
  { a: -0.766, m: -0.985, b: -0.94 },
];

/** The route across the globe, from the white point of origin to the gold
 *  destination. */
const ROUTE = "M13.2 30.2 Q16.5 12.5 33.4 15.6";

/** "100+ Countries": a globe, with a route across it from a point of origin
 *  to a destination in gold. The route is drawn once on arrival; after that
 *  a shipment runs along it — a short bright dash — each time the spotlight
 *  comes, and the destination pings as it lands. */
export function GlobeEmblem({ id }: EmblemProps) {
  const u = (s: string) => `url(#${id}-${s})`;
  return (
    <svg viewBox="0 0 48 48" className="tb-art" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}-sphere`} cx="18" cy="16" r="26" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a4e8f5" />
          <stop offset="0.32" stopColor="#3fbdd8" />
          <stop offset="0.72" stopColor="#1b7c94" />
          <stop offset="1" stopColor="#0e4656" />
        </radialGradient>
        <clipPath id={`${id}-clip`}>
          <circle cx="24" cy="24" r="17" />
        </clipPath>
        <linearGradient id={`${id}-route`} x1="13" y1="30" x2="34" y2="15" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff3cf" />
          <stop offset="1" stopColor="#f2b53e" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="17" fill={u("sphere")} />
      <g clipPath={u("clip")} fill="none" stroke="#fff" strokeOpacity="0.38" strokeWidth="0.9">
        <ellipse cx="24" cy="24" rx="17" ry="3.6" />
        <ellipse cx="24" cy="15.3" rx="14.6" ry="3" />
        <ellipse cx="24" cy="32.7" rx="14.6" ry="3" />
        {MERIDIANS.map((m, k) => (
          <circle
            key={k}
            className="tb-meridian"
            cx="24"
            cy="24"
            r="17"
            style={{ "--a": m.a, "--m": m.m, "--b": m.b } as React.CSSProperties}
          />
        ))}
      </g>
      <path
        className="tb-globe-route"
        d={ROUTE}
        pathLength={1}
        fill="none"
        stroke={u("route")}
        strokeWidth="2.3"
        strokeLinecap="round"
      />
      <path
        className="tb-globe-pulse"
        d={ROUTE}
        pathLength={1}
        fill="none"
        stroke="#fff"
        strokeWidth="2.3"
        strokeLinecap="round"
      />
      <circle cx="13.2" cy="30.2" r="2.1" fill="#fff" />
      <circle className="tb-globe-ping" cx="33.4" cy="15.6" r="2.3" fill="none" stroke="#f2b53e" strokeWidth="1.2" />
      <circle cx="33.4" cy="15.6" r="3.4" fill="#f5c04a" opacity="0.3" />
      <circle cx="33.4" cy="15.6" r="2.3" fill="#f7c54f" stroke="#fff" strokeWidth="1" />
      <ellipse cx="18" cy="14" rx="6.5" ry="3.6" fill="#fff" opacity="0.3" transform="rotate(-24 18 14)" />
    </svg>
  );
}
