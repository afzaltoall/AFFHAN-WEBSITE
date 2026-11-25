"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { DISPLAY, EYEBROW } from "@/components/CinematicExperience/parts";
import { GoldDust } from "@/components/CinematicExperience/GoldDust";
import { COUNTDOWN } from "@/components/CinematicExperience/content";
import { ClockSoundToggle, Unit, ZERO, leftAt, nowInIndia, type Left, type Motion } from "@/components/CinematicExperience/Scene16Countdown";
import { TRIP_CLOSED } from "./content";
import "@/components/CinematicExperience/cinematic.css";
import "./trip-closed.css";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * What every page of the Free China Business Trip shows once applications have closed (the owner, 2026-11-25: "the
 * china trip page have to lock and show the only ui is timer only to december 1 winner announce ... think and do the ui
 * have to be perfectly"). The door (proxy.ts) rewrites every trip page to it from the first moment after 25 November,
 * IST, so the address stays the one that was asked for; a trip page already open turns into it by itself
 * (TripCloseWatch).
 *
 * The time left until the winners are announced (1 December 2026, midnight in India), on the trip film's own clock,
 * the one it ends on (Scene16Countdown): its figures roll as they change, the colons flash with each second, a ring
 * steps round the seconds like a second hand, and the owner's tick and tock can be heard (the speaker in the corner).
 * Under it, the date and time in India now, then one line that applications are closed, and the trip's Terms and
 * Privacy Policy, which stay readable. Nothing else of the trip: no application, no film, no boarding pass, no count.
 *
 * Drawn in the browser only: the server can't know when the page is read, so it sends the clock's empty windows and
 * the browser fills them with the true figures before it first paints them. At zero the clock rests at 00 00 00 00
 * and the line under it says the winners are announced today. Under reduced motion the figures change in place.
 */
export function TripClosedExperience() {
  const root = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState<Left>(() => (typeof window === "undefined" ? ZERO : leftAt(Date.now())));
  const [motion, setMotion] = useState<Motion>("still");
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

  // The colons flash with each second.
  useIsoLayoutEffect(() => {
    if (motion !== "tick") return;
    const seps = root.current?.querySelectorAll<HTMLElement>("[data-cx-sep]");
    if (seps?.length) gsap.fromTo(seps, { opacity: 0.95 }, { opacity: 0.32, duration: 0.9, ease: "power2.out" });
  }, [left.s, motion]);

  const reached = now !== "" && left.d + left.h + left.m + left.s === 0;
  const [dL, hL, mL, sL] = COUNTDOWN.units;
  const dayDigits = Math.max(2, String(left.d).length);
  // A plain element, so the same colons stay in the page from second to second and can flash.
  const sep = (
    <span data-cx="cd-sep" aria-hidden className="cx-cd-sep py-[0.42em]">
      <span data-cx-sep>:</span>
    </span>
  );

  return (
    // data-cx-countdown: the speaker hears the clock only while it is on screen (ClockSoundToggle looks for it).
    <div ref={root} className="tcl" data-cx-countdown>
      <div aria-hidden className="tcl-ground">
        <GoldDust className="absolute inset-0 h-full w-full" density={0.6} />
        <span className="cx-grain absolute inset-0" />
      </div>

      <div className="tcl-sound">
        <ClockSoundToggle label={COUNTDOWN.sound} />
      </div>

      <section className="tcl-col" aria-labelledby="tcl-title">
        <p className={`${EYEBROW} tcl-in`} style={{ ["--d" as string]: "0s" }}>
          {TRIP_CLOSED.eyebrow}
        </p>
        <h1 id="tcl-title" className={`${DISPLAY} cx-cd-title tcl-title tcl-in`} style={{ ["--d" as string]: "0.08s" }}>
          {TRIP_CLOSED.title}
        </h1>

        <div role="timer" aria-labelledby="tcl-title" className="tcl-clock tcl-in" style={{ ["--d" as string]: "0.18s" }}>
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
