import { GoldDust } from "./GoldDust";
import { STEPS, STEPS_HEADING } from "./content";
import { DISPLAY, EYEBROW, PlaceholderTag } from "./parts";

/**
 * 12 How it works: the route. Three steps, a real sequence, so they are
 * numbered, and the scroll travels them.
 *
 * A short pinned stage (sticky, scrubbed by buildSteps in animations.ts).
 * The heading is written in; the planned route appears, dashed, through the
 * three stops (drawn from where the stops really are, so it meets them at
 * every width); then a comet flies it leg by leg, the route turning to solid
 * gold behind it. At each stop it pauses: the stop ignites, its number rises,
 * its title is typed and its line follows. At the last stop (China) the
 * light runs the whole route once. The heading is centred. Across on a
 * desktop, each stop at the head of its column with its words centred under
 * it; down the left on a phone, as a timeline reads. The sky stays visible behind,
 * warmed low in the frame, with dust.
 *
 * As it leaves (buildSteps' way out) it dissolves, and its haze and dust go
 * with it, so the stage never ends in a hard line across the sky: the final
 * call is already arriving underneath.
 *
 * When the stage does not fit the screen (very short windows) it is not
 * pinned and plays as it passes; under reduced motion it is simply there.
 */
export function Scene12HowItWorks() {
  return (
    <section data-cx-steps aria-labelledby="cx-steps-title" className="relative h-[100svh]">
      <div data-cx-steps-stage className="sticky top-0 flex h-[100svh] flex-col justify-center overflow-hidden pt-16">
        <div data-cx="steps-haze" aria-hidden className="cx-steps-haze pointer-events-none absolute inset-0" />
        <div data-cx="steps-dust" aria-hidden className="pointer-events-none absolute inset-0 opacity-80">
          <GoldDust className="h-full w-full" density={0.5} />
        </div>

        <div data-cx="steps-content" className="relative mx-auto w-full max-w-[1360px] px-6 md:px-12">
          <div className="text-center">
            <p data-cx="steps-eyebrow" className={EYEBROW}>
              {STEPS_HEADING.eyebrow}
            </p>
            <h2
              id="cx-steps-title"
              data-cx="steps-title"
              className={`${DISPLAY} mt-3 text-balance text-[clamp(32px,8vw,56px)] leading-[1.04] mx-auto w-fit md:mt-4 md:text-[clamp(44px,min(5vw,9svh),88px)]`}
            >
              {STEPS_HEADING.title}
            </h2>
          </div>

          <ol data-cx="steps-list" className="relative mt-8 grid gap-6 pl-12 md:mt-[clamp(48px,9svh,96px)] md:grid-cols-3 md:gap-12 md:pl-0">
            {/* The route: the planned line (dashed), its three legs in gold, and one run of light. */}
            <svg data-cx="steps-svg" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
              <path data-cx="steps-track" fill="none" stroke="rgb(244 239 230 / 0.28)" strokeWidth="1" strokeDasharray="2 7" />
              {STEPS.map((step) => (
                <path key={step.title} data-cx="steps-seg" className="cx-route" fill="none" stroke="#ecc97e" strokeWidth="1.6" pathLength={1} strokeDasharray="1 1" strokeDashoffset="1" />
              ))}
              <path data-cx="steps-glint" className="cx-route" fill="none" stroke="#fff4d6" strokeWidth="2.6" strokeLinecap="round" pathLength={1} strokeDasharray="0.07 2" strokeDashoffset="0.07" opacity="0" />
            </svg>
            <span data-cx="steps-comet" data-cx-hide aria-hidden className="cx-comet pointer-events-none z-10" />

            {STEPS.map((step, i) => (
              <li key={step.title} data-cx="step" className="relative md:text-center">
                <span aria-hidden data-cx="step-node" className="cx-step-node absolute -left-12 top-[0.3rem] z-[5] md:left-[calc(50%-7.5px)] md:top-0">
                  <span data-cx="step-core" className="cx-step-core" />
                  <span data-cx="step-ring" className="cx-step-ring" />
                  <span data-cx="step-ring2" className="cx-step-ring" />
                </span>
                <span aria-hidden data-cx="step-num" className={`${DISPLAY} cx-step-num block text-[clamp(34px,6svh,52px)] leading-[0.9] tabular-nums text-(--cx-gold) md:mt-11 md:text-[clamp(64px,min(8vw,13svh),132px)] md:leading-[0.8]`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 text-[18px] font-semibold tracking-[-0.01em] text-(--cx-white) md:mt-8 md:text-[clamp(20px,1.9vw,26px)]">
                  <span className="sr-only">Step {i + 1}: </span>
                  <span data-cx="step-title">{step.title}</span>
                  {step.placeholder && (
                    <span data-cx="step-tag" className="inline-block">
                      <PlaceholderTag />
                    </span>
                  )}
                </h3>
                <p data-cx="step-detail" className="mt-1.5 max-w-sm text-[14px] leading-[1.55] text-(--cx-mute) md:mx-auto md:mt-3 md:text-[16px] md:leading-relaxed">
                  {step.detail}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
