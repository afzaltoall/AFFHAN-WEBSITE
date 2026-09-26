"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import gsap from "gsap";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Text that changes by rolling, like a departures board: the old words leave
 * through the top of their window (the bottom, going back) while the new ones
 * rise in from the other side with a trace of blur. The window's contents are
 * this component's own DOM (React renders it empty), so the two can share the
 * screen; the leaving words are hidden from screen readers at once. Under
 * reduced motion the words simply change.
 */
export function Roll({
  text,
  dir,
  className = "",
  itemClassName = "",
  delay = 0.16,
}: {
  text: string;
  /** 1 forward (up and away), -1 back (down and away). */
  dir: number;
  className?: string;
  itemClassName?: string;
  /** How long the new words wait for the old to clear. */
  delay?: number;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const shown = useRef<string | null>(null);

  useIsoLayoutEffect(() => {
    const el = box.current;
    if (!el || shown.current === text) return;
    const first = shown.current === null;
    shown.current = text;
    const olds = Array.from(el.children) as HTMLElement[];
    olds.forEach((o) => o.setAttribute("aria-hidden", "true"));
    const next = document.createElement("span");
    next.className = `ax-roll-item ${itemClassName}`;
    next.textContent = text;
    el.appendChild(next);
    if (first || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      olds.forEach((o) => o.remove());
      return;
    }
    const s = dir < 0 ? -1 : 1;
    gsap.fromTo(next, { yPercent: 110 * s, autoAlpha: 0, filter: "blur(8px)" }, { yPercent: 0, autoAlpha: 1, filter: "blur(0px)", duration: 0.9, ease: "expo.out", delay, clearProps: "filter" });
    olds.forEach((o) => gsap.to(o, { yPercent: -110 * s, autoAlpha: 0, filter: "blur(8px)", duration: 0.5, ease: "power3.in", onComplete: () => o.remove() }));
  }, [text, dir]);

  return <span ref={box} className={`ax-roll ${className}`} />;
}
