"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { DISPLAY, EYEBROW } from "@/components/CinematicExperience/parts";
import { GoldDust } from "@/components/CinematicExperience/GoldDust";
import { COUNTDOWN } from "@/components/CinematicExperience/content";
import { ClockSoundToggle, Digit, ZERO, leftAt, nowInIndia, type Left, type Motion } from "@/components/CinematicExperience/Scene16Countdown";
import { APPLICATION_WINDOW } from "@/lib/trip-application";
import { TRIP_CLOSED } from "./content";
import "@/components/CinematicExperience/cinematic.css";
import "./trip-closed.css";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** The days the days dial measures: from the close to the winners (5), so it drains once over the wait. */
const DAYS_ON_THE_DIAL = Math.round((Date.parse(COUNTDOWN.target) - APPLICATION_WINDOW.closes) / 86_400_000);

/** Before the page runs (wait), with reduced motion (still), or live (tick). */
type DialMotion = "wait" | Motion;

/**
 * One unit of the countdown as a clock's face (the owner, 2026-11-25: "show like a clock style of ui animative"):
 * sixty ticks round it, a gold arc for what is left of the unit (of its 60 seconds, 60 minutes, 24 hours, or the days
 * of the wait), and a bright point at the arc's head that steps clockwise, as a hand does, each time the figure
 * changes, flaring as it steps. The figures roll in the middle, the trip film's own (Digit), the unit's name under
 * them. As the page opens each arc draws itself in, its head running round to its place, one dial after another.
 */
function Dial({ value, max, digits, label, motion, order }: { value: number; max: number; digits: number; label: string; motion: DialMotion; order: number }) {
  const gid = useId().replace(/:/g, "");
  const arc = useRef<SVGCircleElement>(null);
  const head = useRef<SVGGElement>(null);
  const glow = useRef<SVGCircleElement>(null);
  const state = useRef({ v: -1, angle: 0, len: 0, entered: false });

  useIsoLayoutEffect(() => {
    const a = arc.current;
    const h = head.current;
    if (!a || !h) return;
    const st = state.current;
    const draw = (l: number) => {
      a.setAttribute("stroke-dasharray", `${l.toFixed(4)} 1`);
      a.setAttribute("stroke-dashoffset", `${(-(1 - l)).toFixed(4)}`);
    };
    const len = Math.max(0, Math.min(1, value / max));
    if (motion === "wait") {
      // Nothing drawn yet: it draws itself in once the page runs.
      draw(0);
      gsap.set(h, { rotation: 0, svgOrigin: "0 0", autoAlpha: 0 });
      return;
    }
    // The head goes clockwise only, a step for each unit gone (from 00 round to the top again, one step).
    const steps = st.v < 0 ? 0 : (st.v - value + max) % max;
    const angle = st.entered ? st.angle + steps * (360 / max) : (1 - len) * 360;
    if (motion === "still") {
      draw(len);
      gsap.set(h, { rotation: angle, svgOrigin: "0 0", autoAlpha: 1 });
    } else if (!st.entered) {
      // The entrance: the arc draws in and its head runs round to where it belongs, a dial after another.
      const from = { len: 0 };
      const delay = 0.35 + order * 0.14;
      gsap.to(from, { len, duration: 1.5, delay, ease: "power3.out", onUpdate: () => draw(from.len) });
      gsap.fromTo(h, { rotation: 0, svgOrigin: "0 0", autoAlpha: 0 }, { rotation: angle, svgOrigin: "0 0", autoAlpha: 1, duration: 1.5, delay, ease: "power3.out" });
    } else if (value !== st.v) {
      const from = { len: st.len };
      const refill = value > st.v;
      gsap.to(from, { len, duration: refill ? 0.6 : 0.45, ease: refill ? "power2.inOut" : "power3.out", onUpdate: () => draw(from.len) });
      gsap.to(h, { rotation: angle, svgOrigin: "0 0", duration: 0.45, ease: "power3.out" });
      // The step, seen: the point flares, a little less on the seconds' odd beats (tick, tock).
      if (glow.current) gsap.fromTo(glow.current, { opacity: max === 60 && value % 2 ? 0.55 : 0.9, scale: 2, transformOrigin: "50% 50%" }, { opacity: 0, scale: 1, duration: 0.85, ease: "power2.out" });
    }
    state.current = { v: value, angle, len, entered: true };
  }, [value, max, motion, order]);

  const chars = String(value).padStart(digits, "0").split("");
  return (
    // data-cx="cd-unit": the clock's speaker hears the clock while this is on screen (ClockSoundToggle).
    <div data-cx="cd-unit" className="tcl-dial">
      <svg viewBox="-100 -100 200 200" className="tcl-dial-face" aria-hidden>
        <defs>
          <linearGradient id={`tcl-arc-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f2d38e" stopOpacity="0.95" />
            <stop offset="1" stopColor="#d6a84e" stopOpacity="0.6" />
          </linearGradient>
        </defs>
        {Array.from({ length: 60 }, (_, i) => (
          <line
            key={i}
            x1="0"
            y1="-99"
            x2="0"
            y2={i % 5 === 0 ? -92.5 : -96}
            stroke="#f4efe6"
            strokeOpacity={i % 5 === 0 ? 0.34 : 0.13}
            strokeWidth={i % 5 === 0 ? 1 : 0.6}
            transform={`rotate(${i * 6})`}
          />
        ))}
        <circle r="86" fill="none" stroke="#f4efe6" strokeOpacity="0.07" strokeWidth="1" />
        <circle ref={arc} r="86" fill="none" stroke={`url(#tcl-arc-${gid})`} strokeWidth="1.8" pathLength={1} strokeDasharray="0 1" transform="rotate(-90)" strokeLinecap="round" />
        <g ref={head}>
          <circle ref={glow} cx="0" cy="-86" r="6.5" fill="#f2d38e" opacity="0" />
          <circle cx="0" cy="-86" r="2.6" fill="#fff4d6" />
        </g>
      </svg>
      <div className="tcl-dial-in">
        <div className={`${DISPLAY} tcl-dial-num`}>
          {chars.map((c, i) => (
            <Digit key={chars.length - i} value={Number(c)} motion={motion === "tick" ? "tick" : "still"} />
          ))}
        </div>
        <p className="tcl-dial-label">{label}</p>
      </div>
    </div>
  );
}

/**
 * What every page of the Free China Business Trip shows once applications have closed (the owner, 2026-11-25: "the
 * china trip page have to lock and show the only ui is timer only to december 1 winner announce ... think and do the ui
 * have to be perfectly"; then "show like a clock style of ui animative"). The door (proxy.ts) rewrites every trip page
 * to it from the first moment after 25 November, IST, so the address stays the one that was asked for; a trip page
 * already open turns into it by itself (TripCloseWatch).
 *
 * The time left until the winners are announced (1 December 2026, midnight in India) on four clock faces, days, hours,
 * minutes and seconds (Dial), in a row on a computer and two by two on a phone; the owner's tick and tock can be heard
 * (the speaker in the corner, the trip film's own). Over them the date, under them the date and time in India now, then
 * one line that applications are closed, and the trip's Terms and Privacy Policy, which stay readable. Nothing else of
 * the trip: no application, no film, no boarding pass, no count.
 *
 * Drawn in the browser only: the server can't know when the page is read, so its faces are empty until the browser
 * fills them with the true figures. At zero every arc has run out, the figures rest at 00, and the line under them says
 * the winners are announced today. Under reduced motion the faces are drawn at once and the figures change in place.
 */
export function TripClosedExperience() {
  const [left, setLeft] = useState<Left>(() => (typeof window === "undefined" ? ZERO : leftAt(Date.now())));
  const [motion, setMotion] = useState<DialMotion>("wait");
  const [now, setNow] = useState("");
  const [spoken, setSpoken] = useState("");

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timer = 0;
    let minute = -1;
    const tick = () => {
      const t = Date.now();
      const l = leftAt(t);
      setLeft(l);
      setNow(nowInIndia(t));
      const key = l.d * 1440 + l.h * 60 + l.m;
      if (key !== minute) {
        minute = key;
        setSpoken(`${COUNTDOWN.spoken} ${l.d} days, ${l.h} hours, ${l.m} minutes.`);
      }
      if (l.d + l.h + l.m + l.s === 0) return; // Reached: the clock rests at zero.
      // Every second read from the clock, just after it turns, so a sleeping tab or a slow frame never drifts.
      timer = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 12);
    };
    setMotion(reduce ? "still" : "tick");
    tick();
    return () => window.clearTimeout(timer);
  }, []);

  const reached = now !== "" && left.d + left.h + left.m + left.s === 0;
  const [dL, hL, mL, sL] = COUNTDOWN.units;

  return (
    // data-cx-countdown: the speaker hears the clock only while it is on screen (ClockSoundToggle looks for it).
    <div className="tcl" data-cx-countdown>
      <div aria-hidden className="tcl-ground">
        <GoldDust className="absolute inset-0 h-full w-full" density={0.6} />
        <span className="cx-grain absolute inset-0" />
      </div>

      <div className="tcl-sound">
        <ClockSoundToggle label={COUNTDOWN.sound} />
      </div>

      <section className="tcl-col" aria-labelledby="tcl-title">
        <p className={`${EYEBROW} tcl-eyebrow tcl-in`} style={{ ["--d" as string]: "0s" }}>
          {TRIP_CLOSED.eyebrow}
        </p>
        <h1 id="tcl-title" className={`${DISPLAY} cx-cd-title tcl-title tcl-in`} style={{ ["--d" as string]: "0.08s" }}>
          {TRIP_CLOSED.title}
        </h1>

        <div role="timer" aria-labelledby="tcl-title" className="tcl-clock tcl-in" style={{ ["--d" as string]: "0.18s" }}>
          <p className="sr-only">{spoken}</p>
          <div aria-hidden className="tcl-dials">
            <Dial value={left.d} max={Math.max(DAYS_ON_THE_DIAL, left.d)} digits={Math.max(2, String(left.d).length)} label={dL} motion={motion} order={0} />
            <Dial value={left.h} max={24} digits={2} label={hL} motion={motion} order={1} />
            <Dial value={left.m} max={60} digits={2} label={mL} motion={motion} order={2} />
            <Dial value={left.s} max={60} digits={2} label={sL} motion={motion} order={3} />
          </div>
        </div>

        {/* Today, live: so the countdown is plainly counting from now. Held empty until it is known. */}
        <p className="tcl-now tcl-in" style={{ ["--d" as string]: "0.3s" }}>
          {reached ? (
            <span className="tcl-now-reached">{TRIP_CLOSED.reached}</span>
          ) : (
            <>
              <span className="tcl-now-label">{TRIP_CLOSED.now}</span>
              <span className="tcl-now-time">{now}</span>
            </>
          )}
        </p>

        <span aria-hidden className="tcl-rule tcl-in" style={{ ["--d" as string]: "0.4s" }} />
        <p className="tcl-closed tcl-in" style={{ ["--d" as string]: "0.46s" }}>
          {TRIP_CLOSED.closed}
        </p>
        <nav aria-label="Free China Business Trip" className="tcl-links tcl-in" style={{ ["--d" as string]: "0.54s" }}>
          {TRIP_CLOSED.links.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
        </nav>
      </section>
    </div>
  );
}
