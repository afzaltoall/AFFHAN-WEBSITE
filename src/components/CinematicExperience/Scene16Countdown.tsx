"use client";

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import gsap from "gsap";
import { ApplyButton } from "./ApplyButton";
import { createClockSound } from "./clockSound";
import { COUNTDOWN } from "./content";
import { DISPLAY, EYEBROW } from "./parts";

/**
 * 16 The countdown: where the page ends. The time left until COUNTDOWN.target
 * (1 December 2026, midnight IST), live to the second.
 *
 * A layer inside the final stage (Scene14), not a section of its own: the
 * stage's scroll timeline (buildCta) carries the call to action into it (15,
 * into time) and assembles it inside the clock face, so there is no black gap
 * between them. Its figures are live from the moment the page opens.
 *
 *  - Real from the first frame: the true time left is drawn before the clock
 *    is ever seen, and it counts from the moment the page opens; the scroll
 *    reveals it already showing the real figures (never a zero that isn't
 *    true). Beneath it, today's date and time in India, live to the second.
 *  - Then it ticks: each figure that changes rolls down out of its window
 *    while the next falls in from above (a countdown falls), with a trace of
 *    blur; the colons flash on each second; and a ring around the seconds
 *    steps like a second hand, its gold arc draining through the minute.
 *  - Real time: every tick is read from the clock (Date.now), scheduled just
 *    after each whole second, so a sleeping tab or a slow frame never drifts.
 *  - At zero it rests at 00 00 00 00.
 *  - It is heard: the owner's tick and tock on the seconds (clockSound.ts),
 *    on by default, only while the clock is on screen; the speaker in the
 *    top-right corner turns it off (ClockSoundToggle).
 *
 * The figures are drawn on the client only (the server can't know the time
 * the page will be read): its windows are empty, so there is nothing to
 * mismatch. Screen readers get one sentence, updated each minute and never
 * announced (role="timer"). Under reduced motion the figures change in place:
 * no roll, no rise, no ring movement. The numerals use optical size 11, so
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

/** still: change in place. tick: live (figures fall). */
type Motion = "still" | "tick";

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
    <div data-cx="cd-unit" data-cx-hide className="flex flex-col items-center">
      <div className="relative flex py-[0.42em]">
        {ring && <SecondsRing s={value} motion={motion} />}
        {chars.map((c, i) => (
          <Digit key={chars.length - i} value={Number(c)} motion={motion} />
        ))}
      </div>
      {/* 0.12em below 360px: at 0.3em SECONDS is 76px, wider than its figures, and
          on a 320px screen the row needed 349px of 280, so it squeezed and the
          labels ran under the colons and off the edge. */}
      <p className="mt-1 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-(--cx-mute) min-[360px]:tracking-[0.3em] md:mt-2 md:text-[12px] md:tracking-[0.34em]">{label}</p>
    </div>
  );
}

/** localStorage: "off" once the visitor has turned the sound off on this browser ("on" when turned back on). */
const SOUND_KEY = "cx-clock-sound";
/** A click or key press this recent may still be opening something (the Apply popup): the clock waits for it to settle before it starts by itself. */
const SETTLE_MS = 350;

/**
 * The clock, heard: a speaker in the top-right corner, with no words (its
 * name, COUNTDOWN.sound, is for screen readers). The sound is ON by default;
 * the speaker turns it off, and back on.
 *
 * A browser lets a page make sound only once it has had a click, tap or key
 * press (a scroll is not one), so "on" has two looks:
 *  - playing: gold, the waves drawn, and with every tick the speaker knocks,
 *    the waves light up from the speaker outwards and a ring of gold spreads
 *    from the button, in time with what is heard (the tock a little softer);
 *  - waiting for the browser (no click on the page yet): gold, the waves
 *    breathing and the ring inviting. The first click, tap or key press
 *    anywhere starts it, and pressing the speaker then starts it too (it
 *    never turns it off from that state: the visitor has heard nothing yet).
 * Off: a speaker with a cross, quiet. Turning it off is remembered on this
 * browser (localStorage), so the clock stays quiet on the next visit too.
 *
 * Heard only while the clock is on screen: it fades out when the page scrolls
 * back, the tab is hidden or the Apply popup is open, and for good at zero.
 */
function ClockSoundToggle({ label }: { label: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const ring = useRef<HTMLSpanElement>(null);
  const cone = useRef<SVGPathElement>(null);
  const near = useRef<SVGPathElement>(null);
  const far = useRef<SVGPathElement>(null);
  /** off: turned off. waiting: on, until the browser allows sound. live: playing. */
  const [view, setView] = useState<"off" | "waiting" | "live">("waiting");
  const api = useRef<{ toggle: () => void } | null>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Each tick, seen as it is heard: the speaker knocks, its waves light up
    // from the speaker outwards, and a ring spreads from the button.
    const pulse = (even: boolean) => {
      if (reduce) return;
      const peak = even ? 1 : 0.7;
      const out = "cubic-bezier(0.2, 0.7, 0.2, 1)";
      cone.current?.animate([{ transform: "scale(0.86)" }, { transform: "scale(1)" }], { duration: 220, easing: out });
      near.current?.animate([{ opacity: peak }, { opacity: 0.5 }], { duration: 520, easing: out });
      far.current?.animate([{ opacity: 0.5 }, { opacity: peak, offset: 0.2 }, { opacity: 0.5 }], { duration: 640, delay: 70, easing: out });
      ring.current?.animate(
        [
          { transform: "scale(1)", opacity: even ? 0.8 : 0.5 },
          { transform: "scale(1.6)", opacity: 0 },
        ],
        { duration: 820, easing: out },
      );
    };
    const sound = createClockSound(TARGET, pulse);
    const choice = () => {
      try {
        return localStorage.getItem(SOUND_KEY);
      } catch {
        return null;
      }
    };
    const remember = (v: "on" | "off") => {
      try {
        localStorage.setItem(SOUND_KEY, v);
      } catch {
        /* the choice lasts this page view only */
      }
    };
    // On, unless the visitor turned it off on this browser.
    let wanted = choice() !== "off";
    let playing = false;
    let busy = false;
    /** When the page last had a click, tap or key press (outside the speaker). */
    let gesture = 0;
    /** The browser allows sound once the page has had a click, tap or key press. Unknown (no API): try, and let start() find out. */
    const allowed = () => (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive ?? true;
    const show = () => setView(!wanted ? "off" : playing ? "live" : "waiting");
    /** The clock is assembled and on screen, nothing covers it, and it still has time to count. */
    const audible = () => {
      const unit = btn.current?.closest("[data-cx-countdown]")?.querySelector<HTMLElement>("[data-cx='cd-unit']");
      return (
        !!unit &&
        Number(getComputedStyle(unit).opacity) > 0.6 &&
        document.visibilityState === "visible" &&
        !document.querySelector("[data-tg-root]") &&
        TARGET > Date.now()
      );
    };
    /** pressed: the speaker itself was just pressed (that press is what lets the sound start). */
    const sync = async (pressed = false) => {
      if (busy) return;
      const can = audible();
      // A click elsewhere may be opening the Apply popup: let it open before
      // the clock starts by itself, so not even a tick slips out under it.
      const settled = pressed || Date.now() - gesture > SETTLE_MS;
      if (wanted && can && !playing && allowed() && settled) {
        busy = true;
        playing = await sound.start();
        busy = false;
      } else if ((!wanted || !can) && playing) {
        sound.stop();
        playing = false;
      }
      show();
    };
    api.current = {
      toggle: () => {
        // Playing: off. Off, or on but still waiting for the browser: play
        // (this press is what the browser was waiting for).
        wanted = !(wanted && playing);
        remember(wanted ? "on" : "off");
        void sync(true);
      },
    };
    const onGesture = (e: Event) => {
      if (!btn.current?.contains(e.target as Node)) gesture = Date.now();
    };
    const id = window.setInterval(() => void sync(), 250);
    const onVisibility = () => void sync();
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pointerdown", onGesture, true);
    document.addEventListener("keydown", onGesture, true);
    show();
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerdown", onGesture, true);
      document.removeEventListener("keydown", onGesture, true);
      sound.destroy();
      api.current = null;
    };
  }, []);

  return (
    <button
      ref={btn}
      type="button"
      aria-label={label}
      aria-pressed={view !== "off"}
      onClick={() => api.current?.toggle()}
      className="cx-cd-sound"
      data-on={view !== "off" ? "" : undefined}
      data-live={view === "live" ? "" : undefined}
    >
      <span ref={ring} aria-hidden className="cx-cd-sound-ring" />
      <svg aria-hidden viewBox="0 0 24 24" className="cx-cd-sound-glyph">
        <path ref={cone} className="cx-cd-sound-cone" d="M3.5 10.1a1 1 0 0 1 1-1h2.6l4.4-3.7v13.2l-4.4-3.7H4.5a1 1 0 0 1-1-1z" />
        <path ref={near} className="cx-cd-sound-wave" pathLength={1} d="M15 9.2a4 4 0 0 1 0 5.6" />
        <path ref={far} className="cx-cd-sound-wave cx-cd-sound-wave-far" pathLength={1} d="M17.9 6.6a7.7 7.7 0 0 1 0 10.8" />
        <path className="cx-cd-sound-mute" d="M15.6 9.6l4.8 4.8m0-4.8l-4.8 4.8" />
      </svg>
    </button>
  );
}

/** The date and time in India now, to the second: "Saturday 26 September 2026 · 11:42:07". */
const IST = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
function nowInIndia(at: number): string {
  const p = Object.fromEntries(IST.formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month} ${p.year} · ${p.hour}:${p.minute}:${p.second}`;
}

export function Scene16Countdown({ onApply }: { onApply: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  const root = useRef<HTMLDivElement>(null);
  // The real time left from the first render in the browser. The server
  // can't know when the page will be read, so it draws empty windows (no
  // figures, nothing to mismatch) and the browser fills them with the true
  // figures before it first paints them. Never a zero that isn't real.
  const [left, setLeft] = useState<Left>(() => (typeof window === "undefined" ? ZERO : leftAt(Date.now())));
  const [motion, setMotion] = useState<Motion>("still");
  const [now, setNow] = useState("");
  const [spoken, setSpoken] = useState("");

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer = 0;
    let minute = -1;
    const say = (l: Left) => {
      const key = l.d * 1440 + l.h * 60 + l.m;
      if (key === minute) return;
      minute = key;
      setSpoken(`${COUNTDOWN.spoken} ${l.d} days, ${l.h} hours, ${l.m} minutes.`);
    };
    // Live from the moment the page opens, whether or not anyone has scrolled
    // this far: every second read from the clock, just after it turns.
    const tick = () => {
      const t = Date.now();
      const l = leftAt(t);
      setLeft(l);
      setNow(nowInIndia(t));
      say(l);
      if (l.d + l.h + l.m + l.s === 0) return; // Reached: the clock rests at zero.
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 12);
    };
    setMotion(reduce ? "still" : "tick");
    tick();

    return () => window.clearTimeout(timer);
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
    <span data-cx="cd-sep" data-cx-hide aria-hidden className="cx-cd-sep py-[0.42em]">
      {/* The flash is on the colon itself; the scroll reveals its box. */}
      <span data-cx-sep>:</span>
    </span>
  );

  return (
    <div
      ref={root}
      data-cx-countdown
      className="pointer-events-none absolute inset-0 z-[50] flex flex-col items-center justify-center px-5 pb-[4svh] pt-[10svh] text-center"
    >
      <p data-cx="cd-eyebrow" data-cx-hide className={EYEBROW}>
        {COUNTDOWN.eyebrow}
      </p>
      <h2
        id="cx-countdown-title"
        data-cx="cd-title"
        data-cx-hide
        className={`${DISPLAY} cx-cd-title mt-3 text-[clamp(30px,8vw,44px)] font-normal uppercase leading-none tracking-[0.02em] text-(--cx-white) md:mt-4 md:text-[clamp(40px,4vw,64px)]`}
      >
        {COUNTDOWN.title}
      </h2>

      <div data-cx-clock role="timer" aria-labelledby="cx-countdown-title" className="mt-8 md:mt-12">
        <p className="sr-only">{spoken}</p>
        <div data-cx-clock-face aria-hidden className={`${DISPLAY} cx-cd-num flex items-start justify-center`}>
          <Unit value={left.d} digits={dayDigits} label={dL} motion={motion} />
          {sep}
          <Unit value={left.h} digits={2} label={hL} motion={motion} />
          {sep}
          <Unit value={left.m} digits={2} label={mL} motion={motion} />
          {sep}
          <Unit value={left.s} digits={2} label={sL} motion={motion} ring />
        </div>
      </div>

      {/* Today, live: so the countdown is plainly counting from now. */}
      <p data-cx="cd-now" data-cx-hide className="mt-7 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 text-(--cx-mute) md:mt-9">
        <span className="text-[11px] font-semibold uppercase tracking-[0.3em]">{COUNTDOWN.now}</span>
        <span className="min-h-[1.5em] text-[14px] tabular-nums tracking-[0.02em] text-(--cx-white)/85 md:text-[15px]">{now}</span>
      </p>

      <div data-cx="cd-apply" data-cx-hide className="pointer-events-auto mt-9 md:mt-11">
        <ApplyButton onClick={onApply} size="lg">
          {COUNTDOWN.button}
        </ApplyButton>
      </div>

      {/* The clock, heard: in the top-right corner, below the site's bar
          whenever the bar is showing (cinematic.css). */}
      <div className="cx-cd-sound-dock">
        <div data-cx="cd-sound" data-cx-hide className="pointer-events-auto">
          <ClockSoundToggle label={COUNTDOWN.sound} />
        </div>
      </div>
    </div>
  );
}
