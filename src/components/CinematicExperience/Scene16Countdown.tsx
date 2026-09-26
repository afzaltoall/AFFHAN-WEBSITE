"use client";

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import gsap from "gsap";
import { ArrowRight } from "lucide-react";
import { APPLY_HREF, COUNTDOWN } from "./content";
import { DISPLAY, EYEBROW } from "./parts";

/**
 * 16 The countdown: where the page ends. The time left until COUNTDOWN.target
 * (1 December 2026, midnight IST), live to the second.
 *
 *  - Arrival: as the clock comes into view every figure winds up from 00 to
 *    the time left, fast then settling, and lands on the second.
 *  - Then it ticks: each figure that changes rolls down out of its window
 *    while the next falls in from above (a countdown falls), with a trace of
 *    blur; the colons flash on each second; and a ring around the seconds
 *    steps like a second hand, its gold arc draining through the minute.
 *  - Real time: every tick is read from the clock (Date.now), scheduled just
 *    after each whole second, so a sleeping tab or a slow frame never drifts.
 *  - At zero it rests at 00 00 00 00.
 *
 * The figures are drawn on the client only (the server can't know the time
 * the page will be read), from a first frame of zeros, so there is nothing to
 * mismatch. Screen readers get one sentence, updated each minute and never
 * announced (role="timer"). Under reduced motion the figures change in place:
 * no roll, no wind-up, no ring movement. The numerals use optical size 11, so
 * a 4 never reads as a 1 (see cinematic.css).
 */

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
const TARGET = Date.parse(COUNTDOWN.target);

type Left = { d: number; h: number; m: number; s: number };
const ZERO: Left = { d: 0, h: 0, m: 0, s: 0 };

function leftAt(now: number): Left {
  const total = Math.max(0, Math.floor((TARGET - now) / 1000));
  return { d: Math.floor(total / 86400), h: Math.floor((total % 86400) / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

/** still: change in place. wind: the arrival (figures rise). tick: live (figures fall). */
type Motion = "still" | "wind" | "tick";

/** One numeral in a one-line window. The numerals are this component's own
 *  DOM (the window is empty to React), so a change can roll out the old one
 *  while the new one rolls in. */
function Digit({ value, motion }: { value: number; motion: Motion }) {
  const slot = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);

  useIsoLayoutEffect(() => {
    const el = slot.current;
    if (!el || shown.current === value) return;
    const first = shown.current === null;
    shown.current = value;
    const olds = Array.from(el.children) as HTMLElement[];
    const next = document.createElement("span");
    next.className = "cx-cd-glyph";
    next.textContent = String(value);
    el.appendChild(next);
    if (first || motion === "still") {
      olds.forEach((o) => o.remove());
      return;
    }
    if (motion === "wind") {
      gsap.fromTo(next, { yPercent: 100 }, { yPercent: 0, duration: 0.12, ease: "none" });
      olds.forEach((o) => gsap.to(o, { yPercent: -100, duration: 0.12, ease: "none", onComplete: () => o.remove() }));
      return;
    }
    gsap.fromTo(next, { yPercent: -100, autoAlpha: 0, filter: "blur(3px)" }, { yPercent: 0, autoAlpha: 1, filter: "blur(0px)", duration: 0.6, ease: "power3.out", clearProps: "filter" });
    olds.forEach((o) => gsap.to(o, { yPercent: 100, autoAlpha: 0, filter: "blur(3px)", duration: 0.5, ease: "power3.in", onComplete: () => o.remove() }));
  }, [value, motion]);

  return <span ref={slot} className="cx-cd-slot" />;
}

/**
 * The seconds' clock face: sixty ticks, a gold arc for what is left of the
 * minute, and a bright point at its head that steps once a second.
 */
function SecondsRing({ s, motion }: { s: number; motion: Motion }) {
  const arc = useRef<SVGCircleElement>(null);
  const head = useRef<SVGGElement>(null);
  const glow = useRef<SVGCircleElement>(null);
  const state = useRef({ s: -1, angle: 0, len: 0 });

  useIsoLayoutEffect(() => {
    const a = arc.current;
    const h = head.current;
    if (!a || !h) return;
    const st = state.current;
    const len = s / 60;
    const drawArc = (l: number) => {
      a.setAttribute("stroke-dasharray", `${l.toFixed(4)} 1`);
      a.setAttribute("stroke-dashoffset", `${(-(1 - l)).toFixed(4)}`);
    };
    // The head always moves clockwise, one sixtieth per second gone.
    const steps = st.s < 0 ? 0 : (st.s - s + 60) % 60;
    const angle = st.s < 0 ? ((60 - s) % 60) * 6 : st.angle + steps * 6;
    const from = { len: st.len };
    if (motion === "tick" && st.s >= 0) {
      gsap.to(from, { len, duration: s > st.s ? 0.45 : 0.35, ease: s > st.s ? "power2.inOut" : "power3.out", onUpdate: () => drawArc(from.len) });
      gsap.to(h, { rotation: angle, svgOrigin: "0 0", duration: 0.35, ease: "power3.out" });
      // Tick, tock: the point flares on every second, a little less on the odd ones.
      if (glow.current) gsap.fromTo(glow.current, { opacity: s % 2 ? 0.55 : 0.9, scale: 1.9, transformOrigin: "50% 50%" }, { opacity: 0, scale: 1, duration: 0.8, ease: "power2.out" });
    } else {
      drawArc(len);
      gsap.set(h, { rotation: angle, svgOrigin: "0 0" });
    }
    state.current = { s, angle, len };
  }, [s, motion]);

  return (
    <svg viewBox="-100 -100 200 200" className="cx-cd-ring" aria-hidden>
      <defs>
        <linearGradient id="cx-cd-arc" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2d38e" stopOpacity="0.95" />
          <stop offset="1" stopColor="#d6a84e" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {Array.from({ length: 60 }, (_, i) => (
        <line
          key={i}
          x1="0"
          y1="-99"
          x2="0"
          y2={i % 5 === 0 ? -93 : -96.5}
          stroke="#f4efe6"
          strokeOpacity={i % 5 === 0 ? 0.32 : 0.14}
          strokeWidth={i % 5 === 0 ? 0.9 : 0.6}
          transform={`rotate(${i * 6})`}
        />
      ))}
      <circle ref={arc} r="90" fill="none" stroke="url(#cx-cd-arc)" strokeWidth="1.2" pathLength={1} strokeDasharray="0 1" transform="rotate(-90)" strokeLinecap="round" />
      <g ref={head}>
        <circle ref={glow} cx="0" cy="-90" r="6" fill="#f2d38e" opacity="0" />
        <circle cx="0" cy="-90" r="2.4" fill="#fff4d6" />
      </g>
    </svg>
  );
}

function Unit({ value, digits, label, motion, ring }: { value: number; digits: number; label: string; motion: Motion; ring?: boolean }) {
  const chars = String(value).padStart(digits, "0").split("");
  return (
    <div className="flex flex-col items-center">
      <div className="relative flex py-[0.42em]">
        {ring && <SecondsRing s={value} motion={motion} />}
        {chars.map((c, i) => (
          <Digit key={chars.length - i} value={Number(c)} motion={motion} />
        ))}
      </div>
      <p className="mt-1 font-sans text-[10px] font-semibold uppercase tracking-[0.3em] text-(--cx-mute) md:mt-2 md:text-[12px] md:tracking-[0.34em]">{label}</p>
    </div>
  );
}

export function Scene16Countdown({ onApply }: { onApply: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  const root = useRef<HTMLElement>(null);
  const [left, setLeft] = useState<Left>(ZERO);
  const [motion, setMotion] = useState<Motion>("still");
  const [spoken, setSpoken] = useState("");

  useEffect(() => {
    const clock = root.current?.querySelector<HTMLElement>("[data-cx-clock]");
    if (!clock) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer = 0;
    let wind: gsap.core.Tween | null = null;
    let minute = -1;
    const say = (l: Left) => {
      const key = l.d * 1440 + l.h * 60 + l.m;
      if (key === minute) return;
      minute = key;
      setSpoken(`${COUNTDOWN.spoken} ${l.d} days, ${l.h} hours, ${l.m} minutes.`);
    };
    const tick = () => {
      const l = leftAt(Date.now());
      setLeft(l);
      say(l);
      if (l.d + l.h + l.m + l.s === 0) return; // Reached: the clock rests at zero.
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 12);
    };
    const live = () => {
      setMotion(reduce ? "still" : "tick");
      tick();
    };
    say(leftAt(Date.now()));

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        if (reduce) return live();
        // The wind-up: every figure spins up from zero and lands on the second.
        const land = leftAt(Date.now() + 1500);
        const p = { ...ZERO };
        setMotion("wind");
        wind = gsap.to(p, {
          ...land,
          duration: 1.45,
          ease: "power3.out",
          onUpdate: () => setLeft({ d: Math.round(p.d), h: Math.round(p.h), m: Math.round(p.m), s: Math.round(p.s) }),
          onComplete: live,
        });
      },
      { threshold: 0.3 },
    );
    io.observe(clock);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
      wind?.kill();
    };
  }, []);

  // The colons flash with each second.
  useIsoLayoutEffect(() => {
    if (motion !== "tick") return;
    const seps = root.current?.querySelectorAll<HTMLElement>("[data-cx-sep]");
    if (seps?.length) gsap.fromTo(seps, { opacity: 0.95 }, { opacity: 0.32, duration: 0.9, ease: "power2.out" });
  }, [left.s, motion]);

  const [dL, hL, mL, sL] = COUNTDOWN.units;
  const dayDigits = Math.max(2, String(left.d).length);
  // A plain element (not a component made during render), so the same
  // colons stay in the page from second to second and can flash.
  const sep = (
    <span data-cx-sep aria-hidden className="cx-cd-sep py-[0.42em]">
      :
    </span>
  );

  return (
    <section
      ref={root}
      data-cx-countdown
      aria-labelledby="cx-countdown-title"
      className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden px-5 pb-24 pt-28 text-center md:pb-28 md:pt-32"
    >
      {/* The warm horizon the final stage leaves at its lower edge, continued. */}
      <div aria-hidden className="cx-horizon pointer-events-none absolute inset-x-0 top-0 h-[42svh] -scale-y-100" />

      <p className={`${EYEBROW} relative`}>{COUNTDOWN.eyebrow}</p>
      <h2 id="cx-countdown-title" className={`${DISPLAY} relative mt-4 text-[clamp(34px,8.5vw,48px)] font-normal uppercase leading-none tracking-[0.02em] text-(--cx-white) md:text-[clamp(44px,4.4vw,70px)]`}>
        {COUNTDOWN.title}
      </h2>

      <div data-cx-clock role="timer" aria-labelledby="cx-countdown-title" className="relative mt-10 md:mt-14">
        <p className="sr-only">{spoken}</p>
        <div aria-hidden className={`${DISPLAY} cx-cd-num flex items-start justify-center`}>
          <Unit value={left.d} digits={dayDigits} label={dL} motion={motion} />
          {sep}
          <Unit value={left.h} digits={2} label={hL} motion={motion} />
          {sep}
          <Unit value={left.m} digits={2} label={mL} motion={motion} />
          {sep}
          <Unit value={left.s} digits={2} label={sL} motion={motion} ring />
        </div>
      </div>

      <p className="relative mt-8 text-[11px] font-semibold uppercase tracking-[0.3em] text-(--cx-mute) md:mt-10">{COUNTDOWN.zone}</p>

      <a
        href={APPLY_HREF}
        onClick={onApply}
        className="group relative mt-12 inline-flex items-center gap-3 rounded-full bg-(--cx-gold) py-3.5 pl-7 pr-3.5 text-[16px] font-semibold text-(--cx-ink) shadow-[0_14px_50px_-12px_rgb(214_168_78/0.75)] transition-colors duration-300 hover:bg-(--cx-gold-hi) focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--cx-white) md:mt-14 lg:text-[17px]"
      >
        {COUNTDOWN.button}
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-(--cx-ink)/10">
          <ArrowRight size={18} aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5" />
        </span>
      </a>
    </section>
  );
}
