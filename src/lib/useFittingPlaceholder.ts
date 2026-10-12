"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * The longer of two placeholders when it fits the input's text room, else the
 * shorter: measured, not guessed from the width, because the room is what the
 * input has left after whatever else shares its bar, and the font is the
 * browser's own (Safari's runs a little wider than Chrome's). A few pixels are
 * kept spare for that. Starts with the long one, so the server and the first
 * paint agree; a placeholder changing after it moves nothing.
 *
 * The navbar's search, from 768px: on a 768-819px iPad, with the Free China
 * Trip beside it (2026-10-12), "What are you sourcing today?" was cut to
 * "What are you sourcin", as it had been at 1024 the day before.
 */
export function useFittingPlaceholder(
  ref: RefObject<HTMLInputElement | null>,
  long: string,
  short: string,
  /** Whether the input is rendered: the navbar's comes and goes with the page, and is measured as it comes. */
  present = true,
): string {
  const [text, setText] = useState(long);
  useEffect(() => {
    const el = ref.current;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!el || !ctx) return;
    const fit = () => {
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      // Hidden (display: none below 768px): nothing to measure, so nothing changes.
      if (el.clientWidth === 0) return;
      setText(ctx.measureText(long).width + 6 <= room ? long : short);
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    // The web font can land after the first measure, at a different width.
    void document.fonts?.ready.then(fit);
    return () => watch.disconnect();
  }, [ref, long, short, present]);
  return text;
}
