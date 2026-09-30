"use client";

import { Fragment, useEffect, useId, useRef, useState, type AnimationEvent, type CSSProperties, type PointerEvent } from "react";
import { GlobeEmblem, ParcelEmblem, SealEmblem } from "@/components/ui/TrustEmblems";

type Stat = {
  /** The figure's digits, which roll into place. */
  num: string;
  /** The rest of the figure's line, after the digits. */
  after: string;
  /** The caption beneath it. */
  label: string;
  Emblem: typeof SealEmblem;
};

// "500+ Verified", not the "50,000+" this carried before. The catalog holds
// 634 categories, 509 of which actually contain products — the CJ tree is three
// levels deep and that is the whole of it, so the figure was out by roughly two
// orders of magnitude and could never grow into the claim.
const STATS: Stat[] = [
  { num: "500", after: "+ Verified", label: "Categories", Emblem: SealEmblem },
  { num: "10", after: " Lakhs+", label: "Products", Emblem: ParcelEmblem },
  { num: "100", after: "+ Countries", label: "Trusted Global", Emblem: GlobeEmblem },
];

/** A reel's column, top to bottom: its digit, down to 0, then 9 down to 0
 *  again. The window starts on the last line and the column slides down past
 *  it, so the window reads 0, 1 … 9, 0, 1 … up to the digit: once round and
 *  on. The digit is first so that at rest it stands where layout puts the
 *  column's first line, with no transform (globals.css). */
const reelColumn = (d: number) => {
  const col: number[] = [];
  for (let k = d; k >= 0; k--) col.push(k);
  for (let k = 9; k >= 0; k--) col.push(k);
  return col.join("\n");
};

/** A figure's "+" in the teal of the emblems. brand-dark, not brand: at
 *  these sizes the "+" is text, and brand is 2.81:1 on white. */
const withPlus = (s: string) =>
  s.split("+").flatMap((part, k) =>
    k === 0 ? [part] : [<span key={k} className="text-brand-dark">+</span>, part]
  );

/** How long each stat holds the spotlight: the ring round its emblem takes
 *  this long to close, and closing it passes the spotlight on. */
const CYCLE_MS = 3400;

/** The entrance: the three arrive in turn, their figures roll into place and
 *  each emblem plays its motion once. The last of it (the globe's ping)
 *  ends 2.44s in; the spotlight starts after a breath. */
const INTRO_MS = 2800;

/**
 * The hero's three figures, above the search (HeroSearchSection).
 *
 * This was three lines of small text with 18px slate line icons, and a pale
 * box that slid from one to the next every 1.8s. The figures are the part of
 * the hero the page most needs believed, and the row read as the weakest
 * thing on the screen. Now:
 *
 * - Each has an emblem, drawn for it (TrustEmblems.tsx) in the manner of the
 *   rendered icons around it.
 * - On arrival the figures roll into place digit by digit, like an odometer,
 *   and each emblem does what it does once: the seal turns and checks, the
 *   parcel drops in, the globe turns and draws its route.
 * - Then a spotlight passes from one to the next: the emblem glows and moves
 *   again (the seal turns and its check pops, the parcel hops, a shipment
 *   runs the globe's route) while a ring closes round it. One emblem moves at
 *   a time, for about a second in every 3.4, so the row is alive without
 *   being busy. Pointing at a stat holds the spotlight on it; off screen,
 *   nothing moves.
 *
 * All of the motion is CSS on transform, opacity and SVG strokes — nothing
 * runs script per frame — and the rest state is what the server sends, so a
 * visitor who asks for reduced motion (or whose script never arrives) gets
 * the finished row with nothing hidden. The only script is the spotlight's
 * turn, which is handed on by the ring's own animationend rather than a timer.
 */
export function TrustBadges() {
  // Inline SVG ids are page-global; useId keeps the emblems' gradients apart.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const rowRef = useRef<HTMLDivElement>(null);
  const [intro, setIntro] = useState(true);
  const [active, setActive] = useState(-1);
  const [held, setHeld] = useState(false);
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => {
      setIntro(false);
      if (!still) setActive(0);
    }, still ? 0 : INTRO_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const onRingEnd = (e: AnimationEvent) => {
    if (e.animationName !== "tb-ring") return;
    setActive((i) => (i + 1) % STATS.length);
  };

  // A mouse only: a tap raises pointerenter too, and would hold the spotlight
  // until the next tap somewhere else.
  const hold = (i: number) => (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || intro || active < 0) return;
    setHeld(true);
    setActive(i);
  };
  const release = (e: PointerEvent) => {
    if (e.pointerType === "mouse") setHeld(false);
  };

  const rowClass = ["tb-row", intro && "is-intro", held && "is-held", !onScreen && "is-paused"].filter(Boolean).join(" ");

  // Always centred on a line of its own, above the search. Below sm each stat
  // stacks its emblem over its words: measured at 390px, side by side the
  // three are 477px wide in a 358px column, and stacked they are 333px.
  return (
    <div className="w-full flex justify-center">
      <div
        ref={rowRef}
        className={`${rowClass} flex items-stretch justify-center gap-2 min-[360px]:gap-3 min-[390px]:gap-4 sm:gap-6 lg:gap-8`}
        style={{ "--tb-cycle": `${CYCLE_MS}ms` } as CSSProperties}
      >
        {STATS.map((s, i) => (
          <Fragment key={s.label}>
            {i > 0 && (
              <span
                aria-hidden="true"
                className="tb-divider w-px self-stretch bg-gradient-to-b from-transparent via-slate-300 to-transparent"
                style={{ "--i": i } as CSSProperties}
              />
            )}
            <div
              className={`tb-stat${active === i ? " is-active" : ""} flex flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3 sm:text-left`}
              style={{ "--i": i } as CSSProperties}
              onPointerEnter={hold(i)}
              onPointerLeave={release}
            >
              <span aria-hidden="true" className="tb-emblem relative size-9 shrink-0 sm:size-10 lg:size-11">
                <span className="tb-halo" />
                <s.Emblem id={`${uid}-${i}`} />
                <svg className="tb-ring" viewBox="0 0 48 48" onAnimationEnd={onRingEnd}>
                  <circle className="tb-ring-track" cx="24" cy="24" r="23" />
                  <circle className="tb-ring-fill" cx="24" cy="24" r="23" pathLength={1} />
                </svg>
              </span>
              <span className="flex flex-col gap-1">
                {/* The digits are drawn by CSS from each reel's data-col (a
                    reel each, globals.css), so the text here is the number
                    itself, once, for readers and for search; the reels are
                    hidden from both. */}
                <span className="text-[13px] font-bold leading-[1.1] tracking-tight text-slate-900 whitespace-nowrap tabular-nums min-[360px]:text-sm min-[390px]:text-[15px] sm:text-base lg:text-lg">
                  <span className="sr-only">{s.num}</span>
                  <span aria-hidden="true">
                    {[...s.num].map((d, c) => (
                      <span
                        key={c}
                        className="tb-reel"
                        data-col={reelColumn(Number(d))}
                        style={{ "--n": Number(d) + 10, "--c": c } as CSSProperties}
                      />
                    ))}
                  </span>
                  {withPlus(s.after)}
                </span>
                {/* Measured on the hero's ground (#f8fafc): slate-600 is
                    7.24:1, and the brand-dark it turns in the spotlight
                    6.32:1. It was slate-700 only because the old sliding
                    box passed behind it. */}
                <span className="tb-label text-[10px] font-semibold uppercase leading-none tracking-[0.12em] text-slate-600 whitespace-nowrap lg:text-[11px]">
                  {s.label}
                </span>
              </span>
            </div>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
