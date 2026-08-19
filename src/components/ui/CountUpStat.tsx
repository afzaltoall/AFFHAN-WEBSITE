"use client";

import { useEffect, useRef, useState } from "react";

// Count-up figure that is safe to serve to a crawler.
//
// The initial state is the FINAL formatted value, so the server-rendered HTML
// carries the real number — not the 0 that a naive count-up would ship. It also
// means the figure is correct with JavaScript disabled or still loading, and
// the first client render matches the server exactly, so there is no hydration
// mismatch. Only after that does the effect wind it back and animate.

interface CountUpStatProps {
  /** The real value. Rendered formatted on the server, then animated up to. */
  value: number;
  suffix?: string;
  durationMs?: number;
  className?: string;
}

const format = (n: number) => n.toLocaleString("en-US");

export function CountUpStat({ value, suffix = "", durationMs = 1600, className }: CountUpStatProps) {
  const [display, setDisplay] = useState(() => format(value));
  const ref = useRef<HTMLSpanElement>(null);
  const hasRun = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || hasRun.current) return;

    // Reduced motion: leave the final value on screen, animate nothing.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || hasRun.current) return;
        hasRun.current = true;
        observer.disconnect();

        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / durationMs, 1);
          // easeOutExpo — moves fast then settles, which reads as a counter
          // landing on a number rather than a linear ramp.
          const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
          setDisplay(format(Math.round(value * eased)));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {display}
      {suffix}
    </span>
  );
}
