import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ASSETS } from "@/components/CinematicExperience/assets";
import { DISPLAY, EYEBROW, FilmImage } from "@/components/CinematicExperience/parts";
import { FAILURE, SUBMIT, SUCCESS } from "./content";
import { GoldButton } from "./StepNav";

/** Eight particles on the orbit, at fixed angles and sizes (no randomness). */
const ORBITERS = [0, 41, 97, 142, 188, 233, 281, 322].map((deg, i) => ({
  left: 50 + 50 * Math.cos((deg * Math.PI) / 180),
  top: 50 + 50 * Math.sin((deg * Math.PI) / 180),
  size: [6, 4, 5, 3, 6, 4, 5, 3][i],
}));

const TEXT_BUTTON =
  "inline-flex min-h-11 items-center text-[12px] font-semibold uppercase tracking-[0.22em] text-(--cx-white)/75 underline-offset-[6px] transition-colors hover:text-(--cx-white) hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--cx-white)";

/**
 * The submission, and what comes after it.
 *
 * Always mounted, invisible until used, and moved only by ApplyExperience:
 * the submit button contracts into a gold point, the point finds the centre,
 * light expands from it, a thin orbit draws, particles travel it, red silk
 * crosses, everything falls into darkness, a gold line draws across, and
 * APPLICATION RECEIVED rises out of it. If the server hasn't answered by the
 * time the orbit is complete, the orbit keeps turning and one quiet line says
 * the application is being recorded: success is never shown before the
 * server confirms it.
 *
 * The frame is sticky and one screen tall, so it plays in view wherever the
 * review had been scrolled to. Every block below the line (the holding line,
 * the success details, the failure) is always in the page, stacked in one
 * grid cell and hidden until shown, so nothing shifts when the phase changes.
 * The form stays mounted underneath the failure with every answer intact.
 */
export function SubmitStage({
  active,
  pinned,
  reference,
  failure,
  canRetry = true,
  onRetry,
  onReview,
}: {
  active: boolean;
  /** While sending or failed: fixed to the screen, over everything but the navbar. */
  pinned: boolean;
  reference: string | null;
  failure: string;
  /** False when sending again could only be refused again (a duplicate, the window closed). */
  canRetry?: boolean;
  onRetry: () => void;
  onReview: () => void;
}) {
  return (
    <div data-ax="send" className={`absolute inset-0 z-30 ${active ? "" : "pointer-events-none"}`} aria-hidden={active ? undefined : true}>
      {/* Fixed to the screen while the sequence plays; once received, the
          application's one screen (ApplyExperience), which never scrolls. */}
      <div className={`${pinned ? "fixed inset-x-0 bottom-0 top-16" : "absolute inset-0"} flex flex-col items-center justify-center overflow-hidden px-6 text-center`}>
        <div data-ax="send-dark" className="absolute inset-0 bg-(--ax-base) opacity-0" />
        <div data-ax="send-silk" className="pointer-events-none absolute left-[-10%] top-[30%] w-[120%] opacity-0">
          <FilmImage asset={ASSETS.silk} alt="" sizes="120vw" eager className="cx-feather-x" />
        </div>

        {/* Above the line: the success heading. */}
        <div className="relative z-10 flex flex-col items-center">
          <div data-ax="done-host" data-ax-hide className="mb-5 h-[min(20svh,160px)] w-[min(38vw,150px)] overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)] lg:hidden">
            <FilmImage asset={ASSETS.host} alt="" sizes="40vw" eager className="-scale-x-100" />
          </div>
          <p data-ax="done-eyebrow" data-ax-hide className={EYEBROW}>
            {SUCCESS.eyebrow}
          </p>
          <div className="mt-4 overflow-hidden pb-2">
            <h2
              data-ax="done-title"
              data-ax-hide
              tabIndex={-1}
              className={`${DISPLAY} text-balance text-[clamp(38px,9vw,56px)] font-normal uppercase leading-[0.95] tracking-[0.01em] text-(--cx-white) outline-none md:text-[clamp(54px,6vw,96px)]`}
            >
              {SUCCESS.title}
            </h2>
          </div>
        </div>

        {/* The line: the point, the light and the orbit are centred on it. */}
        <div data-ax="send-row" className="relative my-6 h-px self-stretch md:my-8">
          <div
            data-ax="send-light"
            className="absolute left-1/2 top-1/2 -ml-[36vmin] -mt-[36vmin] h-[72vmin] w-[72vmin] rounded-full bg-[radial-gradient(closest-side,rgb(242_211_142/0.5),rgb(214_168_78/0.16)_48%,transparent)] opacity-0"
          />
          <div data-ax="send-orbit" className="absolute left-1/2 top-1/2 -ml-[23vmin] -mt-[23vmin] h-[46vmin] w-[46vmin] opacity-0">
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible">
              <defs>
                <linearGradient id="ax-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#d6a84e" stopOpacity="0.15" />
                  <stop offset="0.55" stopColor="#f2d38e" stopOpacity="0.85" />
                  <stop offset="1" stopColor="#d6a84e" stopOpacity="0.3" />
                </linearGradient>
              </defs>
              <circle data-ax="send-ring" cx="50" cy="50" r="49.5" fill="none" stroke="url(#ax-ring)" strokeWidth="1" vectorEffect="non-scaling-stroke" pathLength={1} strokeDasharray="1" strokeDashoffset="1" />
            </svg>
            <div data-ax="send-orbiters" className="absolute inset-0">
              {ORBITERS.map((o, i) => (
                <span
                  key={i}
                  data-ax="send-orbiter"
                  className="absolute rounded-full bg-(--cx-gold-hi) opacity-0 shadow-[0_0_12px_3px_rgb(242_211_142/0.55)]"
                  style={{ left: `${o.left}%`, top: `${o.top}%`, width: o.size, height: o.size, marginLeft: -o.size / 2, marginTop: -o.size / 2 }}
                />
              ))}
            </div>
          </div>
          <div data-ax="send-line" className="ax-rule absolute inset-x-0 top-0 h-px origin-center opacity-0" />
          <div data-ax="send-point" className="absolute left-1/2 top-1/2 -ml-1.5 -mt-1.5 h-3 w-3 rounded-full bg-(--cx-gold-hi) opacity-0 shadow-[0_0_24px_8px_rgb(242_211_142/0.6)]" />
        </div>

        {/* Below the line: three blocks in one cell, one shown at a time. */}
        <div className="relative z-10 grid w-full max-w-[36rem] justify-items-center [&>*]:[grid-area:1/1]">
          <p data-ax="send-caption" data-ax-hide className="self-start text-[11px] font-semibold uppercase tracking-[0.34em] text-(--cx-gold)">
            {SUBMIT.holding}
          </p>

          <div data-ax="done-details" data-ax-hide className="flex flex-col items-center">
            <p data-ax="done-item" className="text-[18px] leading-snug text-(--cx-white) md:text-[20px]">
              {SUCCESS.line}
            </p>
            <p data-ax="done-item" className="mt-3 text-[15px] leading-relaxed text-(--cx-mute) md:text-[16px]">
              {SUCCESS.next}
            </p>
            <p data-ax="done-ref" className={`mt-5 text-[13px] text-(--cx-mute) ${reference ? "" : "invisible"}`}>
              {SUCCESS.reference} <span className="font-semibold tabular-nums tracking-[0.12em] text-(--cx-gold-hi)">{reference ?? " "}</span>
            </p>
            <div data-ax="done-item" className="mt-8 flex w-full flex-col items-center gap-5 sm:w-auto sm:flex-row">
              <Link
                href={SUCCESS.home.href}
                className="group inline-flex min-h-[3.25rem] w-full items-center justify-between gap-4 rounded-full bg-(--cx-gold) py-2.5 pl-7 pr-2.5 text-[13px] font-semibold uppercase tracking-[0.16em] text-(--cx-ink) shadow-[0_14px_50px_-12px_rgb(214_168_78/0.75)] transition-colors duration-300 hover:bg-(--cx-gold-hi) focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--cx-white) sm:w-auto"
              >
                {SUCCESS.home.label}
                <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-(--cx-ink)/10">
                  <ArrowRight size={17} />
                </span>
              </Link>
              <Link href={SUCCESS.trip.href} className={TEXT_BUTTON}>
                {SUCCESS.trip.label}
              </Link>
            </div>
          </div>

          <div data-ax="fail" data-ax-hide className="flex flex-col items-center">
            <h2 data-ax="fail-title" tabIndex={-1} className={`${DISPLAY} text-balance text-[clamp(28px,6vw,34px)] font-normal uppercase leading-[1.05] text-(--cx-white) outline-none md:text-[40px]`}>
              {FAILURE.title}
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-(--cx-mute)">{failure || FAILURE.line}</p>
            <p className="mt-1 text-[14px] text-(--cx-mute)">{FAILURE.kept}</p>
            <div className="mt-8 flex w-full flex-col items-center gap-5 sm:w-auto sm:flex-row">
              {canRetry && (
                <GoldButton type="button" onClick={onRetry} data-ax-retry className="w-full sm:w-auto">
                  {FAILURE.retry}
                </GoldButton>
              )}
              <button type="button" onClick={onReview} className={TEXT_BUTTON}>
                {FAILURE.review}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
