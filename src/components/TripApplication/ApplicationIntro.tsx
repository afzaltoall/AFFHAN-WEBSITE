import { ASSETS } from "@/components/CinematicExperience/assets";
import { DISPLAY, EYEBROW, FilmImage } from "@/components/CinematicExperience/parts";
import type { WindowState } from "@/lib/trip-application";
import { INTRO } from "./content";
import { GoldButton } from "./StepNav";

/**
 * The chapter opening: eyebrow, heading, one line, a short paragraph, and the
 * way in. Never the form: the intro is its own beat. Every piece is hidden in
 * the first frame (data-ax-hide) and revealed by ApplyExperience's intro
 * timeline, in order; the heading goes from blurred to sharp. Under reduced
 * motion the same pieces simply fade in.
 *
 * Outside the application window (Terms, clause 1) the way in is a line
 * instead: when applications open, or that they closed and when the winners
 * are announced.
 */
export function ApplicationIntro({ onStart, windowState }: { onStart: () => void; windowState: WindowState }) {
  return (
    <div data-ax-view="intro" className="relative max-w-[36rem]">
      {/* Phones and tablets: the host above the heading, cropped to head and
          shoulders (his head is at 50–75% across the picture, centred at
          63%, so the picture is drawn at 210% and moved left to centre it)
          and faded into the dark; never the whole screen. */}
      <div data-ax="intro-host-m" data-ax-hide aria-hidden className="relative mb-6 h-[min(30svh,250px)] w-[min(52vw,210px)] overflow-hidden [mask-image:linear-gradient(to_bottom,black_68%,transparent)] lg:hidden">
        <div className="absolute left-[-82%] top-0 w-[210%]">
          <FilmImage asset={ASSETS.afzalKhan} alt="" sizes="110vw" eager priority />
        </div>
      </div>
      <p data-ax="intro-eyebrow" data-ax-hide className={EYEBROW}>
        {INTRO.eyebrow}
      </p>
      <h2
        data-ax="intro-heading"
        className={`${DISPLAY} mt-5 text-[clamp(34px,11vw,64px)] font-normal uppercase leading-[0.92] tracking-[0.005em] text-(--cx-white) md:text-[clamp(56px,7.4vw,70px)] lg:text-[min(70px,calc((min(100vw,1320px)-96px)*0.057))]`}
      >
        {INTRO.heading.map((line, i) => (
          <span key={line} data-ax="intro-line" data-ax-hide className={`block ${i === 0 ? "text-(--cx-gold-hi)" : ""}`}>
            {line}{" "}
          </span>
        ))}
      </h2>
      <p data-ax="intro-support" data-ax-hide className="mt-7 text-[19px] leading-snug text-(--cx-white) md:text-[22px]">
        {INTRO.line}
      </p>
      <p data-ax="intro-body" data-ax-hide className="mt-4 max-w-[30rem] text-[16px] leading-relaxed text-(--cx-mute) md:text-[17px]">
        {INTRO.body}
      </p>
      <div data-ax="intro-cta" data-ax-hide className="mt-10 flex flex-col items-start gap-4">
        {windowState === "open" ? (
          <>
            <GoldButton type="button" onClick={onStart} data-ax-start className="w-full sm:w-auto">
              {INTRO.cta}
            </GoldButton>
            <p className="text-[13px] text-(--cx-mute)">{INTRO.time}</p>
          </>
        ) : (
          <div role="status" className="border-l-2 border-(--cx-gold) pl-4">
            <p className="text-[17px] font-medium text-(--cx-gold-hi) md:text-[19px]">{windowState === "before" ? INTRO.before : INTRO.closed}</p>
            {windowState === "closed" && <p className="mt-1.5 text-[15px] text-(--cx-mute)">{INTRO.closedNext}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
