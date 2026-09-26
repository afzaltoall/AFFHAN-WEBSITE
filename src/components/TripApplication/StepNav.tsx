import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { NAV } from "./content";

/**
 * The page's gold pill: the same call to action as the landing page's "Apply
 * for the Trip", so the application reads as the next chapter of the film.
 * `data-ax-glow` is the light it gives off when pressed (animated by the
 * page, opacity and scale only).
 */
export function GoldButton({ children, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...rest}
      className={`group relative inline-flex min-h-[3.25rem] items-center justify-between gap-4 rounded-full bg-(--cx-gold) py-2.5 pl-7 pr-2.5 text-[13px] font-semibold uppercase tracking-[0.16em] text-(--cx-ink) shadow-[0_14px_50px_-12px_rgb(214_168_78/0.75)] transition-colors duration-300 hover:bg-(--cx-gold-hi) focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--cx-white) ${className}`}
    >
      <span aria-hidden data-ax-glow className="pointer-events-none absolute -inset-4 rounded-full bg-[radial-gradient(closest-side,rgb(242_211_142/0.6),transparent)] opacity-0" />
      <span data-ax-label className="relative">
        {children}
      </span>
      <span aria-hidden className="relative flex h-9 w-9 items-center justify-center rounded-full bg-(--cx-ink)/10 transition-transform duration-300 group-hover:translate-x-0.5">
        <ArrowRight size={17} />
      </span>
    </button>
  );
}

/**
 * ← BACK / CONTINUE → / SUBMIT APPLICATION →. The primary button submits the
 * step's form, so Enter in a field continues too. Arriving from the review's
 * Edit, it saves and returns there instead, and Back is not offered.
 */
export function StepNav({ step, last, editing, onBack }: { step: number; last: number; editing: boolean; onBack: () => void }) {
  const primary = step === last ? NAV.submit : editing ? NAV.toReview : NAV.next;
  return (
    <div className="mt-10 flex flex-col-reverse items-stretch gap-5 border-t border-(--cx-white)/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
      {step > 0 && !editing ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-center text-[12px] font-semibold uppercase tracking-[0.22em] text-(--cx-white)/70 transition-colors hover:text-(--cx-white) focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--cx-white) sm:self-auto"
        >
          <ArrowLeft size={16} aria-hidden />
          {NAV.back}
        </button>
      ) : (
        <span className="hidden sm:block" />
      )}
      <GoldButton type="submit" data-ax-submit={step === last ? "" : undefined} className="w-full sm:w-auto">
        {primary}
      </GoldButton>
    </div>
  );
}
