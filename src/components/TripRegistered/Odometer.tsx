"use client";

import { useEffect, useState } from "react";

/**
 * A number on rolling drums, like a departures board's counter: each digit is
 * a strip of 0–9 moved to its figure, so a change rolls the drums that change,
 * and on first appearance they all roll up from 0. CSS transforms only; under
 * reduced motion the figures simply change (registered.css).
 *
 * Screen readers get `label`, not the drums.
 */
export function Odometer({ value, label, className = "" }: { value: number; label: string; className?: string }) {
  const target = Math.max(0, Math.floor(value));
  const len = String(target).length;
  // What the drums show: 0 for the first frame, then the figure, so they roll.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(target));
    return () => cancelAnimationFrame(id);
  }, [target]);
  const digits = String(Math.min(shown, 10 ** len - 1)).padStart(len, "0").split("");
  return (
    <span className={`tr-odo ${className}`} role="img" aria-label={label}>
      {digits.map((d, i) => (
        // Keyed from the right, so the units drum stays the same element as the number grows.
        <span key={len - i} className="tr-odo-window" aria-hidden>
          <span className="tr-odo-strip" style={{ transform: `translateY(-${Number(d) * 10}%)` }}>
            {"0123456789".split("").map((n) => (
              <span key={n}>{n}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}
