"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The figures on the sign-in panel, counted up.
 *
 * WHAT IS AND IS NOT ON HERE. /employee/login/ is a public, unauthenticated
 * page: anybody on the internet can open it. So these are only numbers the
 * site already publishes — the catalogue size and category count are on the
 * homepage and every location page, the country and office counts are in the
 * footer of all twenty pages. Lead, inquiry, customer and queue counts are
 * deliberately NOT here. Those are the business's trading volume, and a login
 * screen is the wrong place to hand them to a stranger.
 *
 * The values arrive from the server already resolved — the page counts them in
 * its own render (see the route), so there is no client fetch, no loading
 * state and no request added to the page. This component only animates a
 * number it was already given.
 *
 * Reduced motion skips the count entirely and prints the final figure, because
 * a number ticking for a second and a half is exactly the kind of motion that
 * setting is asking to be spared.
 */

export interface DeskStat {
  label: string;
  value: number;
  /** "+" for a floor like "100+", "" otherwise. */
  suffix?: string;
}

const DURATION = 1400;

/** Ease-out so it decelerates into the real figure rather than stopping dead. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function useCountUp(target: number) {
  const [n, setN] = useState(target);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(target);
      return;
    }

    let raf = 0;
    const t0 = performance.now();
    setN(0);
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / DURATION);
      setN(Math.round(target * easeOut(p)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return n;
}

function Stat({ label, value, suffix = "" }: DeskStat) {
  const n = useCountUp(value);
  return (
    <div className="min-w-0">
      {/* tabular-nums so the digits do not jitter the layout while counting. */}
      {/* en-US to match ProductCategoriesSection, which prints the same
          catalogue figure on the public site. en-IN grouping would render it
          "10,79,241" here and "1,079,241" two clicks away. */}
      <p className="text-2xl font-black tabular-nums tracking-tight text-white">
        {n.toLocaleString("en-US")}
        {suffix}
      </p>
      <p className="mt-0.5 truncate text-[11px] font-medium uppercase tracking-wider text-white/45">
        {label}
      </p>
    </div>
  );
}

export function LiveDeskStats({ stats }: { stats: DeskStat[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      {stats.map((s) => (
        <Stat key={s.label} {...s} />
      ))}
    </div>
  );
}

export default LiveDeskStats;
