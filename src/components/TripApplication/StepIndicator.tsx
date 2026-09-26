import { STEPS } from "./content";

/**
 * Where the applicant is: 01 ─── 02 ─── 03 ─── 04 ─── 05 on a desktop, "STEP
 * 01 OF 05" on a phone. The gold line between numbers fills as each step is
 * passed, a small comet of light at its head (CSS; none under reduced
 * motion). No numbered cards.
 */
export function StepIndicator({ step }: { step: number }) {
  const last = STEPS.length - 1;
  return (
    <nav aria-label="Application progress" data-ax="indicator" data-ax-hide>
      {/* Phone */}
      <div className="md:hidden">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-(--cx-gold)">
          Step {STEPS[step].number} <span className="text-(--cx-mute)">of {STEPS[last].number}</span>
        </p>
        <div aria-hidden className="relative mt-3 h-px overflow-hidden bg-(--cx-white)/12">
          <div
            className="absolute inset-0 origin-left bg-(--cx-gold) transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{ transform: `scaleX(${(step + 1) / STEPS.length})` }}
          />
        </div>
      </div>

      {/* Desktop */}
      <ol className="hidden items-center md:flex">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex items-center" aria-current={i === step ? "step" : undefined}>
            <span
              className={`text-[12px] font-semibold tabular-nums tracking-[0.24em] transition-colors duration-500 ${
                i === step ? "text-(--cx-gold)" : i < step ? "text-(--cx-white)" : "text-(--cx-white)/35"
              }`}
            >
              {s.number}
              <span className="sr-only">
                {" "}
                {s.title}
                {i < step ? " (done)" : i === step ? " (current step)" : ""}
              </span>
            </span>
            {i < last && (
              <span aria-hidden className="relative mx-4 h-px w-[clamp(28px,4.2vw,72px)] bg-(--cx-white)/15">
                {/* Width, not scale, so the comet at its head rides the edge. */}
                <span className="ax-seg absolute inset-y-0 left-0 bg-(--cx-gold)" data-filled={i < step ? "" : undefined} style={{ width: i < step ? "100%" : "0%" }} />
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
