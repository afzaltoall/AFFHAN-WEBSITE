import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { boardLines, BOARD_COLS } from "./board";
import { TERMS } from "./content";
import { GoldDust } from "./GoldDust";
import { DISPLAY, EYEBROW } from "./parts";

/**
 * 13 Terms & Conditions: the fine print, read under a lamp at the departure
 * gate. Readability first; everything that moves is light, not layout.
 *
 *  - The sky stays: a veil darkens it behind the words and fades into it at
 *    every edge, so the stars frame the text without crossing a line of it.
 *  - A reading lamp: a warm pool of light, with dust drifting in it, rests at
 *    the reading line (sticky), and each clause lights as it passes through.
 *  - The title stays beside the list while it is read, with a departure
 *    board under it that sets the clause being read (board.ts) as a flight
 *    is set: 03 APPLICATION PERIOD, 04 WINNER SELECTION... (wide screens).
 *  - A gold thread runs down the clauses, filling with the reading, a bead
 *    of light at its head and a stop at each clause.
 *  - Each clause arrives as it is reached: its rule draws across, its number
 *    rises, its title is typed, its words follow.
 *
 * buildTerms (animations.ts) runs it; under reduced motion nothing moves and
 * the board simply shows the clause.
 *
 * The words are the trip's Terms & Conditions, quoted (content.ts takes them
 * from lib/trip-legal.ts): eight key clauses under their own numbers and
 * titles, each linking to the clause on /free-china-trip/terms/, with the
 * whole document and the Privacy Policy a click away beside the title.
 */
export function Scene13Terms() {
  const [before, after] = TERMS.title.split("&");
  return (
    <section id="terms" data-cx-terms aria-labelledby="cx-terms-title" className="relative pb-20 pt-28 md:pb-28 md:pt-40">
      <div aria-hidden className="cx-terms-veil pointer-events-none absolute inset-0" />
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="cx-terms-lamp sticky top-0 h-[100svh] overflow-hidden">
          <GoldDust className="h-full w-full" density={0.5} />
        </div>
      </div>

      <div className="relative mx-auto grid max-w-[1180px] gap-14 px-6 md:px-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-20">
        <div data-cx="terms-side">
          <div className="lg:sticky lg:top-24">
            <p data-cx="terms-eyebrow" className={EYEBROW}>
              {TERMS.eyebrow}
            </p>
            <h2 id="cx-terms-title" data-cx="terms-title" className={`${DISPLAY} cx-terms-title mt-4 text-[clamp(38px,9vw,60px)] leading-[1.02] text-(--cx-white) lg:text-[clamp(44px,4vw,68px)]`}>
              {before}
              <span className="text-(--cx-gold)">&amp;</span>
              {after}
            </h2>
            <div className="relative mt-8 pl-5">
              <span aria-hidden data-cx="terms-notice-rule" className="absolute bottom-0 left-0 top-0 w-px origin-top bg-(--cx-gold)/60" />
              <p className="text-[15px] leading-[1.75] text-(--cx-mute)">
                <span data-cx="terms-notice-text">{TERMS.notice}</span>
              </p>
              <p data-cx="terms-links" className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                <Link href={TERMS.full.href} className="cx-terms-link">
                  {TERMS.full.label}
                  <ArrowUpRight aria-hidden size={15} strokeWidth={2} />
                </Link>
                <Link href={TERMS.privacy.href} className="cx-terms-link cx-terms-link-quiet">
                  {TERMS.privacy.label}
                </Link>
              </p>
            </div>
            <DepartureBoard />
          </div>
        </div>

        <div className="relative pl-(--g) [--g:2.5rem] md:[--g:3.5rem]">
          {/* The reading thread: gold fills down it, a bead of light at its head. */}
          <span aria-hidden className="absolute bottom-0 left-[7px] top-0 w-px bg-(--cx-faint)" />
          <span aria-hidden data-cx="terms-thread" className="cx-thread absolute bottom-0 left-[7px] top-0 w-px origin-top" />
          <span aria-hidden data-cx="terms-bead" className="cx-bead absolute left-[7.5px] top-0" />
          <span aria-hidden data-cx="terms-end" className="cx-terms-end absolute bottom-0 left-[7.5px]">
            <span data-cx="terms-end-core" className="cx-step-core" />
            <span data-cx="terms-end-ring" className="cx-step-ring" />
          </span>

          <ol data-cx="terms-list">
            {TERMS.sections.map((s) => (
              <li key={s.clause} data-cx="term" data-title={s.title} data-clause={s.clause} className="cx-term relative py-8 md:py-9">
                <span aria-hidden data-cx="term-rule" className="absolute inset-x-0 top-0 h-px origin-left bg-(--cx-faint)" />
                <span aria-hidden className="cx-term-lit absolute inset-x-0 top-0 h-px origin-left" />
                <span aria-hidden className="cx-term-dot absolute left-[calc(3px-var(--g))] top-[calc(2rem+8px)] md:top-[calc(2.25rem+9px)]" />
                <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-baseline gap-x-3 md:grid-cols-[3.75rem_minmax(0,1fr)] md:gap-x-4">
                  <span aria-hidden data-cx="term-num" className={`${DISPLAY} cx-term-num block text-[26px] leading-none text-(--cx-gold) md:text-[32px]`}>
                    {pad(s.clause)}
                  </span>
                  <h3 className="cx-term-title text-[18px] font-semibold tracking-[-0.01em] md:text-[20px]">
                    <span className="sr-only">Clause {s.clause}: </span>
                    <span data-cx="term-title">{s.title}</span>
                  </h3>
                  {s.note && (
                    <p data-cx="term-note" className="cx-term-note col-start-2 mt-3">
                      {s.note}
                    </p>
                  )}
                  <p className="cx-term-body col-start-2 mt-2.5 text-[15px] leading-[1.75] md:text-[16px]">
                    <span data-cx="term-text">{s.body.join(" ")}</span>
                  </p>
                  <p data-cx="term-link" className="col-start-2 mt-3">
                    <Link href={`${TERMS.full.href}#clause-${s.clause}`} className="cx-term-more">
                      Clause {pad(s.clause)} in full
                      <span className="sr-only">: {s.title}</span>
                      <ArrowRight aria-hidden size={13} strokeWidth={2} />
                    </Link>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/**
 * The board, as the server renders it: clause 01 already set, so it reads
 * correctly before (and without) JavaScript. Decorative: every word on it is
 * in the list, so it is hidden from screen readers.
 */
function DepartureBoard() {
  const text = boardLines(TERMS.sections[0].title);
  const [d0, d1] = pad(TERMS.sections[0].clause);
  return (
    <div data-cx="terms-board" aria-hidden className="cx-board mt-10 hidden lg:block">
      <div className="flex items-center justify-between">
        <span className="cx-board-label">Clause</span>
        <span className="flex gap-1">
          {TERMS.sections.map((s, i) => (
            <i key={s.clause} data-cx="board-seg" className="cx-board-seg" {...(i === 0 ? { "data-on": "", "data-now": "" } : {})} />
          ))}
        </span>
      </div>
      <div className="mt-3 flex items-end gap-3">
        <span className="flex gap-[3px]">
          <Flap kind="digit" ch={d0} />
          <Flap kind="digit" ch={d1} />
        </span>
        <span className="cx-board-of">/ {TERMS.count}</span>
      </div>
      <div className="mt-4 grid gap-[3px]">
        {text.map((row, r) => (
          <div key={r} className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${BOARD_COLS}, minmax(0, 1fr))` }}>
            {Array.from(row).map((ch, c) => (
              <Flap key={c} kind="letter" ch={ch} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A clause number as the document sets it: 03, 18. */
function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** One split-flap tile: static top and bottom halves, and the two leaves that turn. */
function Flap({ kind, ch }: { kind: "digit" | "letter"; ch: string }) {
  return (
    <span data-flap={kind} data-ch={ch} className={`cx-flap cx-flap-${kind}`}>
      <span className="cx-flap-t">
        <b>{ch}</b>
      </span>
      <span className="cx-flap-b">
        <b>{ch}</b>
      </span>
      <span className="cx-flap-lt">
        <b>{ch}</b>
        <i />
      </span>
      <span className="cx-flap-lb">
        <b>{ch}</b>
        <i />
      </span>
    </span>
  );
}
