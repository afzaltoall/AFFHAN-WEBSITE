import { STEPS, STEPS_HEADING } from "./content";
import { DISPLAY, EYEBROW, PlaceholderTag } from "./parts";

/**
 * 12 How it works. Three steps, a real sequence, so they are numbered.
 *
 * Large numerals and a thin line joining them, with gold filling the line as
 * you scroll through the section (one scrubbed ScrollTrigger in
 * animations.ts). No icons, no cards. Across on desktop; down the left edge on
 * phones, where the line runs vertically.
 */
export function Scene12HowItWorks() {
  return (
    <section data-cx-steps aria-labelledby="cx-steps-title" className="relative bg-(--cx-ink) py-24 md:py-36">
      <div className="mx-auto max-w-[1360px] px-6 md:px-12">
        <p className={EYEBROW}>{STEPS_HEADING.eyebrow}</p>
        <h2 id="cx-steps-title" className={`${DISPLAY} mt-4 text-balance text-[clamp(38px,9vw,64px)] leading-[1] md:text-[clamp(48px,5vw,88px)]`}>
          {STEPS_HEADING.title}
        </h2>

        <ol className="relative mt-16 grid gap-14 pl-10 md:mt-24 md:grid-cols-3 md:gap-12 md:pl-0">
          {/* The track and its gold fill: vertical on phones, across on desktop. */}
          <span aria-hidden className="absolute bottom-3 left-[7px] top-3 w-px bg-(--cx-faint) md:bottom-auto md:left-0 md:right-0 md:top-[2.9rem] md:h-px md:w-auto" />
          <span
            aria-hidden
            data-cx="steps-fill"
            className="absolute bottom-3 left-[7px] top-3 w-px origin-top bg-(--cx-gold) md:bottom-auto md:left-0 md:right-0 md:top-[2.9rem] md:h-px md:w-auto md:origin-left"
          />
          {STEPS.map((step, i) => (
            <li key={step.title} data-cx="step" className="relative">
              <span aria-hidden data-cx="step-node" className="absolute -left-10 top-[0.4rem] block h-[15px] w-[15px] rounded-full border border-(--cx-gold) bg-(--cx-ink) md:left-0 md:top-[calc(2.9rem-7px)]" />
              <span aria-hidden className={`${DISPLAY} block text-[72px] leading-none tabular-nums text-(--cx-gold) md:pl-8 md:text-[clamp(88px,8vw,132px)] md:leading-[0.8]`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-5 text-[22px] font-semibold tracking-[-0.01em] text-(--cx-white) md:mt-10 md:pl-8 md:text-[26px]">
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
                {step.placeholder && <PlaceholderTag />}
              </h3>
              <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-(--cx-mute) md:pl-8 md:text-[16px]">{step.detail}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
