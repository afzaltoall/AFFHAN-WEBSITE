"use client";

import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { ArrowRight, Plane } from "lucide-react";
import { APPLY_HREF } from "./content";

/**
 * "Apply for the Trip", everywhere on the page (the opening frame, the final
 * call, the countdown): one button, made like a piece of gold.
 *
 *  - A polished metal face (a gradient with a raised highlight and a shadowed
 *    lower edge), the words pressed into it, a warm glow breathing behind.
 *  - A spark of light running round its rim, as the gold light trail runs
 *    through the film (a conic gradient turned by a registered property).
 *  - Every few seconds the light catches it: a glint crosses the face. It is
 *    clipped to the button, so it never touches anything behind it.
 *  - Hovered: it lifts and leans a little towards the pointer, the rim's
 *    spark races, the glint crosses at once, and in the dark porthole the
 *    arrow departs as a plane takes off into its place.
 *
 * The anchor is the root, so the page's exit (goApply) still presses and
 * lights the element it was given. Nothing moves under reduced motion; the
 * lean needs a precise pointer. Styles: .cx-apply* in cinematic.css.
 */
export function ApplyButton({
  onClick,
  children,
  size = "md",
}: {
  onClick: (e: MouseEvent<HTMLAnchorElement>) => void;
  children: ReactNode;
  size?: "md" | "lg";
}) {
  const ref = useRef<HTMLAnchorElement>(null);

  // The lean: the face follows the pointer a few pixels, and settles back.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      el.style.setProperty("--mx", `${(Math.max(-1, Math.min(1, dx)) * 6).toFixed(2)}px`);
      el.style.setProperty("--my", `${(Math.max(-1, Math.min(1, dy)) * 4).toFixed(2)}px`);
    };
    const leave = () => {
      el.style.removeProperty("--mx");
      el.style.removeProperty("--my");
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
      leave();
    };
  }, []);

  return (
    <a
      ref={ref}
      href={APPLY_HREF}
      onClick={onClick}
      className={`cx-apply cx-apply-${size} group relative inline-flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-(--cx-white)`}
    >
      <span className="cx-apply-body">
        <span aria-hidden className="cx-apply-rim" />
        <span aria-hidden className="cx-apply-face" />
        <span aria-hidden className="cx-apply-sheen" />
        <span className="cx-apply-label">{children}</span>
        <span aria-hidden className="cx-apply-port">
          <ArrowRight className="cx-apply-arrow" strokeWidth={2.2} />
          <Plane className="cx-apply-plane" strokeWidth={1.9} />
        </span>
      </span>
    </a>
  );
}
