/**
 * The curved transition between two sections.
 *
 * Inline SVG and nothing else — no library, no JS, no image request. It is one
 * path with a `fill`, so it costs a few hundred bytes of markup and paints with
 * the section it belongs to.
 *
 * `preserveAspectRatio="none"` on purpose: the wave should stretch to whatever
 * width the viewport is and keep a fixed height, rather than scaling its height
 * with the width and becoming a canyon on a desktop monitor.
 *
 * aria-hidden because it carries no information. A screen reader announcing
 * "image" between every section would be pure noise.
 */
export function WaveDivider({
  /** The colour of the section ABOVE, which is what the wave is cut out of. */
  from = "#ffffff",
  /** The colour of the section BELOW, which shows through the curve. */
  to = "#f8fafc",
  className = "",
  flip = false,
}: {
  from?: string;
  to?: string;
  className?: string;
  flip?: boolean;
}) {
  return (
    <div aria-hidden="true" className={`relative w-full overflow-hidden leading-[0] ${className}`}>
      <svg
        viewBox="0 0 1440 96"
        preserveAspectRatio="none"
        className={`block h-[48px] w-full sm:h-[72px] lg:h-[96px] ${flip ? "rotate-180" : ""}`}
        style={{ background: to }}
      >
        {/* One cubic through three control points: a shallow trough left of
            centre and a crest right of it. Deliberately asymmetric — a
            symmetrical wave reads as a default shape rather than a decision. */}
        <path
          d="M0,0 L1440,0 L1440,40 C1200,96 1040,8 780,44 C520,80 300,24 0,64 Z"
          fill={from}
        />
      </svg>
    </div>
  );
}
