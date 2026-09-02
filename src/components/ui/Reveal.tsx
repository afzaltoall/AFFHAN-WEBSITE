"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveal a section as it scrolls into view: fade up, once, then done.
 *
 * IntersectionObserver rather than a scroll listener, because the browser does
 * the intersection maths off the main thread and hands back a callback — a
 * scroll handler would run on every frame of every scroll for the life of the
 * page to answer a question that is settled after the first yes.
 *
 * No GSAP and no Lenis here, deliberately. ScrollTrigger earns its ~50KB when
 * something is pinned or scrubbed to scroll position; this page reveals blocks
 * of text and cards, which is a class toggle. And Lenis works by cancelling the
 * browser's own scrolling and re-implementing it in JS — the exact "override
 * wheel/touch input" that makes a page feel wrong on a trackpad, fight with a
 * screen reader's caret, and lag on a low-end phone.
 *
 * The hidden state is CSS (globals.css) rather than inline style, so it is
 * scoped to prefers-reduced-motion: no-preference. Someone who asked for less
 * motion gets the content immediately, with nothing waiting on an observer.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** Stagger, in ms. Keep small — this is a beat, not a queue. */
  delay?: number;
  as?: "div" | "section" | "li" | "span";
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Older browsers, and any environment without the API, must not be left
    // looking at an empty page.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    // Already on screen at mount — anything above the fold — should not wait
    // for a scroll that may never come.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            // One-shot: re-animating on the way back up is a distraction, and
            // an observer left attached keeps firing for the life of the page.
            observer.unobserve(entry.target);
          }
        }
      },
      {
        // Start a little before the edge, so the movement finishes about when
        // the block is properly in view rather than starting there.
        rootMargin: "0px 0px -12% 0px",
        threshold: 0.05,
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as never}
      className={`reveal ${visible ? "is-visible" : ""} ${className}`}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}

/**
 * Restores the revealed state for anyone without JavaScript.
 *
 * The hidden state is applied by a stylesheet, so it would otherwise hold with
 * nothing left to lift it. Render this once on any page that uses Reveal.
 */
export function RevealNoScriptFallback() {
  return (
    <noscript>
      <style>{`.reveal { opacity: 1 !important; transform: none !important; }`}</style>
    </noscript>
  );
}
