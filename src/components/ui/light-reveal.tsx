"use client";

import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

/**
 * Scroll-driven "magic light" reveal.
 *
 * As the wrapped block scrolls into view, a cyan light beam sweeps across
 * (left→right or right→left depending on `from`), brightening as it goes, and
 * the content is carried in on its wake — sliding from the side and settling
 * into place ("right → left-down" style). Fully tied to scroll position, so
 * scrolling back reverses it. No clicks.
 *
 * Safe to wrap only plain sections — do NOT use it around blocks that rely on
 * `position: sticky` or their own scroll transforms (a transformed ancestor
 * breaks sticky / GSAP pins).
 */
export function LightRevealSection({
  children,
  from = "right",
  className,
}: {
  children: ReactNode;
  from?: "left" | "right";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.9", "start 0.35"],
  });

  const dir = from === "right" ? 1 : -1;

  // Content: comes from the side + slightly up, settles to its natural spot.
  const x = useTransform(scrollYProgress, [0, 1], [dir * 150, 0]);
  const y = useTransform(scrollYProgress, [0, 1], [-38, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.94, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.55, 1], [0, 0.75, 1]);

  // Light beam: sweeps across the section, brightening then fading as the
  // content lands.
  const lightX = useTransform(scrollYProgress, [0, 1], [`${dir * 45}%`, `${dir * -35}%`]);
  const lightOpacity = useTransform(scrollYProgress, [0, 0.45, 1], [0, 1, 0]);
  const lightScale = useTransform(scrollYProgress, [0, 1], [0.7, 1.25]);

  if (reduce) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <div ref={ref} className={`relative overflow-hidden ${className ?? ""}`}>
      {/* magic light sweep — a wide soft glow + a bright core streak */}
      <motion.div
        aria-hidden
        style={{ x: lightX, opacity: lightOpacity, scale: lightScale }}
        className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-2/3 -translate-x-1/2"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(39,168,196,0.55)_0%,_rgba(23,101,121,0.20)_42%,_transparent_72%)] blur-3xl" />
        <div className="absolute inset-y-0 left-1/2 w-28 -translate-x-1/2 bg-[linear-gradient(90deg,_transparent,_rgba(150,235,255,0.9),_transparent)] blur-2xl" />
      </motion.div>

      {/* content carried in on the light */}
      <motion.div style={{ x, y, scale, opacity, willChange: "transform, opacity" }}>
        {children}
      </motion.div>
    </div>
  );
}

export default LightRevealSection;
