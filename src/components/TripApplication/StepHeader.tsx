import { DISPLAY } from "@/components/CinematicExperience/parts";
import { STEPS } from "./content";

/**
 * The application's heading, over its questions: the title and its line. One page since 2026-10-29, so no step
 * numeral and no "Step 01 of 04".
 *
 * The title is the form's label (aria-labelledby) and takes focus when the questions arrive, so a keyboard or a
 * screen reader starts from it.
 */
export function StepHeader() {
  const s = STEPS[0];
  return (
    <header className="ax-head mt-2 md:mt-3">
      <h2
        id="ax-step-title"
        tabIndex={-1}
        className={`${DISPLAY} ax-step-title text-[clamp(26px,7.4vw,34px)] font-normal uppercase leading-[0.98] text-(--cx-white) outline-none md:text-[38px] lg:text-[clamp(32px,2.8vw,46px)]`}
      >
        {s.title}
      </h2>
      <p className="ax-step-lede mt-2 max-w-[30rem] text-[15px] leading-relaxed text-(--cx-mute) md:text-[16px]">{s.lede}</p>
    </header>
  );
}
