"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The questions' own scrolling area, on the application's one fixed screen:
 * between the step's heading and its buttons, which never move. It scrolls
 * only when a step is taller than the screen; then its edges fade where there
 * is more to see (data-above / data-below, apply.css) and its scrollbar is a
 * thin gold line. A focused field, or the first one with a problem, is
 * scrolled into view by the browser as usual.
 *
 * Its first child is the step's own grid, whose children are the lines the
 * page prints and lifts (ApplyExperience, stepRows).
 */
export function StepScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const edges = () => {
      el.toggleAttribute("data-above", el.scrollTop > 2);
      el.toggleAttribute("data-below", el.scrollTop + el.clientHeight < el.scrollHeight - 2);
    };
    edges();
    el.addEventListener("scroll", edges, { passive: true });
    // A step that grows (step 02's questions after its first answer, an error
    // under a field) or a window that changes size.
    const ro = new ResizeObserver(edges);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", edges);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={ref} data-ax-body className="ax-step-scroll ax-thin-scroll -mx-2.5 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 pb-7 pt-1">
      {children}
    </div>
  );
}
