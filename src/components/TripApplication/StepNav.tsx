import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowRight, Plane } from "lucide-react";
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
 * Submit, under the questions (one page since 2026-10-29: no Back, no Next, and nothing asked again over it: the Terms
 * and the Privacy Policy were agreed in the popup before the questions). Enter in a field submits too.
 *
 * Disabled only while the application is being sent (Cloudflare's check never holds it: ApplyExperience). A missing
 * answer is shown on Submit, under its question.
 */
export function StepNav({ disabled = false }: { disabled?: boolean }) {
  return (
    <div data-ax="nav" className="border-t border-(--cx-white)/10 pt-5">
      {/* Phones: the gold button across, lowest (under the thumb, and below the site's chat bubble, which floats 96px
          up). Tablets and up: on the right, the bubble's corner (bottom right) left free. */}
      <div className="flex flex-col items-stretch sm:flex-row sm:justify-end md:pr-[4.75rem] lg:pr-0">
        <GoldButton type="submit" data-ax-submit="" disabled={disabled} className="w-full sm:w-auto">
          {NAV.submit}
        </GoldButton>
      </div>
    </div>
  );
}
