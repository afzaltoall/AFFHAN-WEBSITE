import { DISPLAY } from "@/components/CinematicExperience/parts";
import { STEPS } from "./content";
import { Roll } from "./Roll";

/**
 * The step's heading, which stays on the page while the steps change under
 * it: a large gold numeral whose figures roll to the next step like a clock,
 * and the title and its line rolling out and in. Changes the moment Continue
 * is pressed, while the scanning light lifts the fields below.
 *
 * The title is the form's label (aria-labelledby) and takes focus on each
 * new step, so a keyboard or a screen reader starts from it.
 */
export function StepHeader({ step, dir }: { step: number; dir: number }) {
  const s = STEPS[step];
  return (
    <header className="mt-10 flex items-start gap-5 md:mt-14 md:gap-8">
      <span aria-hidden className={`${DISPLAY} ax-step-num flex shrink-0`}>
        <Roll text={s.number[0]} dir={dir} itemClassName="ax-num-ink" delay={0.1} />
        <Roll text={s.number[1]} dir={dir} itemClassName="ax-num-ink" delay={0.1} />
      </span>
      <div className="min-w-0 flex-1 pt-[0.35em] md:pt-[0.6em]">
        <h2
          id="ax-step-title"
          tabIndex={-1}
          className={`${DISPLAY} text-[clamp(32px,8vw,44px)] font-normal uppercase leading-[0.98] text-(--cx-white) outline-none md:text-[clamp(40px,4vw,60px)]`}
        >
          <span className="sr-only">Step {s.number} of {String(STEPS.length).padStart(2, "0")}: </span>
          <Roll text={s.title} dir={dir} className="grid" />
        </h2>
        <p className="mt-3 max-w-[30rem] text-[16px] leading-relaxed text-(--cx-mute)">
          <Roll text={s.lede} dir={dir} className="grid" delay={0.24} />
        </p>
      </div>
    </header>
  );
}
