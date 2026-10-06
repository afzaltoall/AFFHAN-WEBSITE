"use client";

import { useEffect, useState } from "react";
import { COUNTDOWN } from "@/components/CinematicExperience/content";
import { REGISTERED } from "./content";

const TARGET = Date.parse(COUNTDOWN.target);
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The time left until the winners are announced (1 December 2026, midnight
 * in India: the landing page's own countdown target), to the second. Drawn in
 * the browser only: the server can't know when the page is read.
 */
export function DrawCountdown() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    let t = 0;
    const tick = () => {
      setNow(Date.now());
      t = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 12);
    };
    tick();
    return () => window.clearTimeout(t);
  }, []);

  const left = now === null ? null : Math.max(0, Math.floor((TARGET - now) / 1000));
  const parts = left === null ? null : [Math.floor(left / 86400), Math.floor((left % 86400) / 3600), Math.floor((left % 3600) / 60), left % 60];

  if (left === 0) return <p className="tr-count-reached">{REGISTERED.pool.reached}</p>;
  return (
    <div className="tr-count" role="timer" aria-label={parts ? `${parts[0]} days, ${parts[1]} hours and ${parts[2]} minutes until the winners are announced` : undefined}>
      {REGISTERED.pool.units.map((u, i) => (
        <div key={u} className="tr-count-unit" aria-hidden>
          <span className="tr-count-num">{parts ? (i === 0 ? String(parts[0]) : pad(parts[i])) : "··"}</span>
          <span className="tr-count-label">{u}</span>
        </div>
      ))}
    </div>
  );
}
