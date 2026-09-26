import type { MouseEvent } from "react";
import { APPLY_HREF, CHAPTERS } from "./content";

/**
 * The film's chapter mark, bottom right: "03 / 11  Boarding", a thin progress
 * line, and a way out for anyone who wants to apply without watching. The
 * readout is decorative (aria-hidden); the skip link is real. Its text is
 * written by the film timeline (CinematicExperience -> onFilmProgress) only
 * when the chapter changes.
 */
export function FilmHud({ onSkip }: { onSkip: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <div
      data-cx="hud"
      data-cx-hide
      className="pointer-events-none absolute bottom-5 left-6 z-[90] flex items-center gap-4 text-[11px] uppercase tracking-[0.24em] text-(--cx-mute) md:bottom-7 md:left-[6vw] md:gap-6"
    >
      <span aria-hidden className="flex items-center gap-3">
        <span className="tabular-nums">
          <span data-cx="hud-num" className="text-(--cx-white)">01</span> / {String(CHAPTERS.length).padStart(2, "0")}
        </span>
        <span data-cx="hud-name" className="hidden min-w-[7.5rem] sm:inline">{CHAPTERS[0]}</span>
        <span className="relative hidden h-px w-20 overflow-hidden bg-(--cx-faint) md:block">
          <span data-cx="hud-bar" className="absolute inset-0 origin-left scale-x-0 bg-(--cx-gold)" />
        </span>
      </span>
      <a
        href={APPLY_HREF}
        onClick={onSkip}
        className="pointer-events-auto rounded-full border border-(--cx-white)/20 px-4 py-2 text-(--cx-white) transition-colors hover:border-(--cx-gold) hover:text-(--cx-gold-hi) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--cx-white)"
      >
        Skip to application
      </a>
    </div>
  );
}
