/**
 * 15 CTA -> countdown. The short beat between the call to action and the
 * countdown that ends the page, so scrolling on is not a jump cut: the button
 * swells slightly, gold light floods out from it, the frame falls to black,
 * and a low horizon of warm light is left at the bottom edge. The countdown
 * opens with the same horizon at its top, so the seam is invisible.
 *
 * Three layers inside the final stage; the choreography is the tail of
 * buildCta in animations.ts. (Pressing "Apply for the Trip" opens the
 * application instead: CinematicExperience's goApply.)
 */
export function Scene15CtaToCountdown() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-[60] flex items-center justify-center">
        <div data-cx="cta-flood" data-cx-hide aria-hidden className="cx-glow-gold h-[70vmax] w-[70vmax] shrink-0 rounded-full" />
      </div>
      <div data-cx="cta-dark" data-cx-hide aria-hidden className="pointer-events-none absolute inset-0 z-[61] bg-(--cx-ink)" />
      <div data-cx="cta-horizon" data-cx-hide aria-hidden className="cx-horizon pointer-events-none absolute inset-x-0 bottom-0 z-[62] h-[42svh]" />
    </>
  );
}
