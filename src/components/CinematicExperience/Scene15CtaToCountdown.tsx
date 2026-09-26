/**
 * 15 Into time: the bridge from the call to action to the countdown, inside
 * the same pinned stage, so the page never falls into an empty black gap.
 *
 * Scrubbed by the tail of buildCta (animations.ts): the button's gold light
 * floods the frame, and instead of going dark the frame warms (the ground
 * below); then a giant clock face (the ring) pulls in from beyond the edges
 * of the screen, turning as it comes, its sixty ticks lighting one after
 * another, and the countdown (Scene16) assembles inside it. (Pressing "Apply
 * for the Trip" opens the application instead: CinematicExperience's goApply.)
 */
export function Scene15CtaToCountdown() {
  return (
    <>
      {/* The warm field the countdown stands in: gold at the centre, crimson low. */}
      <div data-cx="time-ground" data-cx-hide aria-hidden className="cx-time-ground pointer-events-none absolute inset-0 z-[3]" />

      {/* The clock face: a thin gold ring, its sixty ticks, a faint outer rim. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-[30] flex items-center justify-center">
        <div data-cx="time-ring" data-cx-hide className="aspect-square w-[min(122vmin,1180px)] shrink-0">
          <svg viewBox="-100 -100 200 200" className="h-full w-full overflow-visible">
            <defs>
              <linearGradient id="cx-time-arc" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#d6a84e" stopOpacity="0.2" />
                <stop offset="0.45" stopColor="#f2d38e" stopOpacity="0.9" />
                <stop offset="0.7" stopColor="#fff4d6" stopOpacity="0.95" />
                <stop offset="1" stopColor="#d6a84e" stopOpacity="0.35" />
              </linearGradient>
            </defs>
            <circle r="99.2" fill="none" stroke="#d6a84e" strokeOpacity="0.12" strokeWidth="0.25" />
            <circle data-cx="time-arc" r="94" fill="none" stroke="url(#cx-time-arc)" strokeWidth="0.42" pathLength={1} strokeDasharray="1" strokeDashoffset="1" transform="rotate(-90)" />
            {Array.from({ length: 60 }, (_, i) => (
              <line
                key={i}
                data-cx="time-tick"
                x1="0"
                y1="-91"
                x2="0"
                y2={i % 5 === 0 ? -85.5 : -88.6}
                stroke="#f2d38e"
                strokeOpacity={i % 5 === 0 ? 0.75 : 0.34}
                strokeWidth={i % 5 === 0 ? 0.6 : 0.34}
                transform={`rotate(${i * 6})`}
                opacity="0"
              />
            ))}
          </svg>
        </div>
      </div>

      {/* The light that floods out of the button. */}
      <div className="pointer-events-none absolute inset-0 z-[60] flex items-center justify-center">
        <div data-cx="cta-flood" data-cx-hide aria-hidden className="cx-glow-gold h-[70vmax] w-[70vmax] shrink-0 rounded-full" />
      </div>
    </>
  );
}
