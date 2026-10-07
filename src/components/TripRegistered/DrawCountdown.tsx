"use client";

import { useEffect, useState } from "react";
import { COUNTDOWN } from "@/components/CinematicExperience/content";
import { REGISTERED } from "./content";

const TARGET = Date.parse(COUNTDOWN.target);
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * One unit of the countdown as a split-flap clock's card: when its figure
 * changes, the top half of the old one falls forward and the bottom half of
 * the new one lands under it (registered.css), as an airport clock turns, to
 * match the departures board below. Every turn is keyed, so each change plays
 * once. Under reduced motion the leaves are not drawn and the figure simply
 * changes. The words for screen readers are the timer's own (DrawCountdown).
 */
function FlipCard({ value }: { value: string }) {
  const [card, setCard] = useState({ now: value, was: value, turn: 0 });
  // A new figure: the one before it is kept for the leaves that fall.
  if (card.now !== value) setCard({ now: value, was: card.now, turn: card.turn + 1 });
  const { now, was, turn } = card;
  return (
    <span className="tr-flip">
      <span className="tr-flip-half tr-flip-top">
        <span>{now}</span>
      </span>
      <span className="tr-flip-half tr-flip-bottom">
        <span>{now}</span>
      </span>
      {turn > 0 && (
        <span key={turn} className="tr-flip-leaves">
          {/* The old figure's foot, until the new one lands over it. */}
          <span className="tr-flip-half tr-flip-bottom tr-flip-stay">
            <span>{was}</span>
          </span>
          <span className="tr-flip-half tr-flip-top tr-flip-fall">
            <span>{was}</span>
          </span>
          <span className="tr-flip-half tr-flip-bottom tr-flip-land">
            <span>{now}</span>
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * The time left until the winners are announced (1 December 2026, midnight
 * in India: the landing page's own countdown target), to the second, on
 * split-flap cards. Drawn in the browser only: the server can't know when the
 * page is read.
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
          <FlipCard value={parts ? (i === 0 ? String(parts[0]) : pad(parts[i])) : "··"} />
          <span className="tr-count-label">{u}</span>
        </div>
      ))}
    </div>
  );
}
