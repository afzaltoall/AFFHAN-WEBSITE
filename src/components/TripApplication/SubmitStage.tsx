"use client";

import { useEffect, useState } from "react";
import { DISPLAY, EYEBROW } from "@/components/CinematicExperience/parts";
import { FAILURE, SUBMIT, SUCCESS } from "./content";
import { GoldButton } from "./StepNav";

/** The clock face's sixty ticks (every fifth one longer, as on the film's countdown). */
const TICKS = Array.from({ length: 60 }, (_, i) => i);

const TEXT_BUTTON =
  "inline-flex min-h-11 items-center text-[12px] font-semibold uppercase tracking-[0.22em] text-(--cx-white)/75 underline-offset-[6px] transition-colors hover:text-(--cx-white) hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--cx-white)";

const IST_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const IST_STAMP = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
/** "18:42:07, 1 October 2026" (India) */
function stamp(iso: string) {
  const p = Object.fromEntries(IST_STAMP.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute}:${p.second}, ${p.day} ${p.month} ${p.year}`;
}

/**
 * The time in India at the clock's centre, to the second, each figure rolling
 * in as it changes (the film's countdown hand). Running only while `run`.
 */
function ClockTime({ run }: { run: boolean }) {
  const [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    if (!run) return;
    let t = 0;
    const tick = () => {
      setNow(IST_TIME.format(Date.now()));
      t = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 8);
    };
    tick();
    return () => window.clearTimeout(t);
  }, [run]);
  const text = now ?? "··:··:··";
  return (
    <div className="ax-clock-time" aria-hidden>
      <span className={`${DISPLAY} ax-clock-digits`}>
        {text.split("").map((c, i) =>
          c === ":" ? (
            <span key={`c${i}`} className="ax-clock-colon">
              :
            </span>
          ) : (
            <span key={i} className="ax-clock-cell">
              <span key={c} className="ax-clock-digit">
                {c}
              </span>
            </span>
          ),
        )}
      </span>
      <span className="ax-clock-zone">India</span>
    </div>
  );
}

/**
 * The submission, and what comes after it: the light of time.
 *
 * Always mounted, invisible until used, and moved only by ApplyExperience.
 * Three layers, each centred on the screen on its own, so nothing shifts as
 * one gives way to the next:
 *
 *  1. Processing. The plane leaves Submit's porthole and flies off on its gold
 *     contrail (takeoff.ts); the form frosts away; at the exact centre a clock
 *     face of light opens, the film's own sixty ticks, a point of light
 *     sweeping round it like a second hand (the ticks flare as it passes), the
 *     time in India rolling at its centre, second by second: "Processing your
 *     application".
 *  2. Submitted, when the server confirms (never before). The light sweeps
 *     once more and lights every tick, the full circle flashes, and it folds
 *     into a line of light that rises to become the horizon APPLICATION
 *     SUBMITTED rises from: the Trip ID the database wrote, the moment it was
 *     recorded, and a thin line filling while the page carries the applicant
 *     on to the participants board (or at once, from the button).
 *  3. Failed: the reason, and the way on. The form stays mounted underneath
 *     with every answer intact.
 */
export function SubmitStage({
  active,
  pinned,
  phase,
  reference,
  registeredAt,
  firstName,
  failure,
  canRetry = true,
  onRetry,
  onReview,
  onSignIn,
  onContinue,
}: {
  active: boolean;
  /** While sending or failed: fixed to the screen, over everything but the navbar. */
  pinned: boolean;
  /** The page's phase: the clock's time runs while sending. */
  phase: string;
  reference: string | null;
  /** When the database recorded it (ISO). */
  registeredAt: string | null;
  /** For "Welcome aboard, …". */
  firstName: string;
  failure: string;
  /** False when sending again could only be refused again (a duplicate, the window closed). */
  canRetry?: boolean;
  onRetry: () => void;
  onReview: () => void;
  /** Offered in place of Try again when the sign-in has ended. */
  onSignIn?: () => void;
  /** On to the participants board, now. */
  onContinue: () => void;
}) {
  return (
    <div data-ax="send" className={`absolute inset-0 z-30 ${active ? "" : "pointer-events-none"}`} aria-hidden={active ? undefined : true}>
      <div className={`${pinned ? "fixed inset-x-0 bottom-0 top-16" : "absolute inset-0"} overflow-hidden text-center`}>
        {/* The form behind, frosted and darkened away. */}
        <div data-ax="send-dark" className="absolute inset-0 bg-(--ax-base) opacity-0 backdrop-blur-[10px]" />
        <div
          data-ax="send-light"
          className="pointer-events-none absolute left-1/2 top-1/2 -ml-[42vmin] -mt-[42vmin] h-[84vmin] w-[84vmin] rounded-full bg-[radial-gradient(closest-side,rgb(242_211_142/0.26),rgb(214_168_78/0.08)_48%,transparent)] opacity-0"
        />

        {/* 1. Processing: the clock of light at the exact centre, its line below it. */}
        <div className="absolute inset-0 z-10 grid place-items-center px-6">
          <div className="relative">
            <div data-ax="send-clock" className="ax-clock opacity-0">
              <svg viewBox="-100 -100 200 200" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
                <defs>
                  <radialGradient id="ax-clock-core">
                    <stop offset="0" stopColor="#f2d38e" stopOpacity="0.2" />
                    <stop offset="1" stopColor="#f2d38e" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <circle r="64" fill="url(#ax-clock-core)" className="ax-clock-core" />
                <circle r="88" fill="none" stroke="rgb(244 239 230 / 0.07)" strokeWidth="0.8" />
                {TICKS.map((i) => (
                  <line
                    key={i}
                    data-ax="send-tick"
                    x1="0"
                    y1="-97"
                    x2="0"
                    y2={i % 5 === 0 ? -89.5 : -93}
                    stroke="#fff3d2"
                    strokeWidth={i % 5 === 0 ? 1.3 : 0.8}
                    strokeLinecap="round"
                    opacity="0.16"
                    transform={`rotate(${i * 6})`}
                  />
                ))}
                {/* Submitted: the whole circle, lit, and a ring of light going out from it. */}
                <circle data-ax="send-full" r="88" fill="none" stroke="#f2d38e" strokeWidth="1.4" pathLength={1} strokeDasharray="1" strokeDashoffset="1" transform="rotate(-90)" />
                <circle data-ax="send-wave" r="88" fill="none" stroke="#fff3d2" strokeWidth="1.6" opacity="0" />
              </svg>
              {/* The light of time: a point sweeping the face, its gold trail behind it. */}
              <div data-ax="send-hand" className="ax-hand">
                <span className="ax-hand-trail" />
                <span className="ax-hand-head" />
              </div>
              <ClockTime run={phase === "sending"} />
            </div>
            <p data-ax="send-caption" data-ax-hide className="absolute left-1/2 top-full mt-8 w-max max-w-[86vw] -translate-x-1/2 text-[12px] font-semibold uppercase tracking-[0.34em] text-(--cx-gold) md:mt-10">
              {SUBMIT.processing}
            </p>
          </div>
        </div>

        {/* 2. Submitted, centred on its own. */}
        <div data-ax="done" data-ax-hide className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6">
          <span data-ax="send-line" aria-hidden className="ax-rule ax-send-line block h-px" />
          <div className="mt-7 overflow-hidden pb-1 md:mt-9">
            <h2
              data-ax="done-title"
              tabIndex={-1}
              className={`${DISPLAY} text-balance text-[clamp(36px,9vw,56px)] font-normal uppercase leading-[0.95] tracking-[0.01em] text-(--cx-white) outline-none md:text-[clamp(52px,5.6vw,84px)]`}
            >
              {SUCCESS.title}
            </h2>
          </div>
          <p data-ax="done-eyebrow" className={`${EYEBROW} mt-4`}>
            {SUCCESS.eyebrow}
          </p>
          <p data-ax="done-line" className="mt-3 text-[17px] leading-snug text-(--cx-white)/90 md:text-[19px]">
            {SUCCESS.line(firstName)}
          </p>
          {reference && (
            <div data-ax="done-ref" className="ax-trip-id mt-6">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.3em] text-(--cx-mute)">{SUCCESS.reference}</span>
              <span className="mt-1.5 block text-[24px] font-semibold tabular-nums tracking-[0.14em] text-(--cx-gold-hi) md:text-[28px]">{reference}</span>
              {registeredAt && (
                <span className="mt-1.5 block text-[12px] tabular-nums text-(--cx-mute)">
                  {SUCCESS.recorded} {stamp(registeredAt)}
                </span>
              )}
            </div>
          )}
          <div data-ax="done-next" className="mt-7 flex w-full max-w-[22rem] flex-col items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.26em] text-(--cx-mute)">{SUCCESS.next}</span>
            <span aria-hidden className="relative block h-px w-full overflow-hidden bg-(--cx-white)/12">
              <span data-ax="done-bar" className="absolute inset-0 origin-left scale-x-0 bg-gradient-to-r from-(--cx-gold-deep) via-(--cx-gold) to-(--cx-gold-hi)" />
            </span>
            <button type="button" onClick={onContinue} data-ax-continue className={`${TEXT_BUTTON} mt-1 text-(--cx-gold)`}>
              {SUCCESS.go}
            </button>
          </div>
        </div>

        {/* 3. Failed, centred on its own. */}
        <div data-ax="fail" data-ax-hide className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6">
          <h2 data-ax="fail-title" tabIndex={-1} className={`${DISPLAY} max-w-[40rem] text-balance text-[clamp(28px,6vw,34px)] font-normal uppercase leading-[1.05] text-(--cx-white) outline-none md:text-[40px]`}>
            {FAILURE.title}
          </h2>
          <p className="mt-4 max-w-[36rem] text-[16px] leading-relaxed text-(--cx-mute)">{failure || FAILURE.line}</p>
          <p className="mt-1 text-[14px] text-(--cx-mute)">{FAILURE.kept}</p>
          <div className="mt-8 flex w-full flex-col items-center gap-5 sm:w-auto sm:flex-row">
            {onSignIn ? (
              <GoldButton type="button" onClick={onSignIn} data-ax-retry className="w-full sm:w-auto">
                {FAILURE.signInAgain}
              </GoldButton>
            ) : (
              canRetry && (
                <GoldButton type="button" onClick={onRetry} data-ax-retry className="w-full sm:w-auto">
                  {FAILURE.retry}
                </GoldButton>
              )
            )}
            <button type="button" onClick={onReview} className={TEXT_BUTTON}>
              {FAILURE.review}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
