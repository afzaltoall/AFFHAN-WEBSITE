import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowLeft, ArrowRight, Plane } from "lucide-react";
import { NAV } from "./content";

/**
 * The page's gold button: the same piece of gold as the landing page's
 * "Apply for the Trip" (ApplyButton; the .cx-apply styles in cinematic.css):
 * a polished face, a spark running round the rim, a glint now and then, and
 * on hover a plane taking off where the arrow was. So the application reads
 * as the next chapter of the film. `data-ax-glow` is the light it gives off
 * when pressed (animated by the page, opacity and scale only).
 */
export function GoldButton({ children, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...rest}
      className={`cx-apply cx-apply-lg group relative inline-flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--cx-white) ${className}`}
    >
      <span aria-hidden data-ax-glow className="pointer-events-none absolute -inset-4 rounded-full bg-[radial-gradient(closest-side,rgb(242_211_142/0.6),transparent)] opacity-0" />
      <span className="cx-apply-body min-h-[3.25rem] w-full justify-between">
        <span aria-hidden className="cx-apply-rim" />
        <span aria-hidden className="cx-apply-face" />
        <span aria-hidden className="cx-apply-sheen" />
        <span data-ax-label className="cx-apply-label cx-apply-caps">
          {children}
        </span>
        <span aria-hidden className="cx-apply-port">
          <ArrowRight className="cx-apply-arrow" strokeWidth={2.2} />
          <Plane className="cx-apply-plane" strokeWidth={1.9} />
        </span>
      </span>
    </button>
  );
}

/**
 * ← BACK / CONTINUE → / SUBMIT APPLICATION →. The primary button submits the
 * step's form, so Enter in a field continues too. Arriving from the review's
 * Edit, it saves and returns there instead, and Back is not offered.
 *
 * Submit is disabled until every answer the application needs is in and the
 * three consent boxes are ticked, and again while the application is being
 * sent. While it waits, `hint` says what is missing, beside it (and is read
 * out as it changes); the gold is dimmed and still (apply.css, data-blocked).
 */
export function StepNav({
  step,
  last,
  editing,
  onBack,
  disabled = false,
  hint = "",
}: {
  step: number;
  last: number;
  editing: boolean;
  onBack: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  const primary = step === last ? NAV.submit : editing ? NAV.toReview : NAV.next;
  return (
    <div data-ax="nav" className="border-t border-(--cx-white)/10 pt-5">
      {step === last && (
        <p id="ax-submit-hint" role="status" className={`text-center text-[13px] leading-relaxed text-(--cx-mute) sm:text-right md:pr-[4.75rem] lg:pr-0 ${hint ? "mb-3.5" : ""}`}>
          {hint}
        </p>
      )}
      {/* Phones: Back above, the gold button lowest (under the thumb, and
          below the site's chat bubble, which floats 96px up). Tablets: one
          row, the bubble's corner (bottom right) left free. */}
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 md:pr-[4.75rem] lg:pr-0">
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
        <GoldButton
          type="submit"
          data-ax-submit={step === last ? "" : undefined}
          disabled={disabled}
          data-blocked={hint ? "" : undefined}
          aria-describedby={step === last && hint ? "ax-submit-hint" : undefined}
          className="w-full sm:w-auto"
        >
          {primary}
        </GoldButton>
      </div>
    </div>
  );
}
