"use client";

import { motion, type HTMLMotionProps } from "framer-motion";

// Scroll-reveal wrapper for the /sourcing-company-chennai landing page.
//
// `className` is forwarded onto the motion element itself rather than an extra
// wrapper div, so a Reveal can BE a grid/flex child (the service cards, process
// steps and stat tiles are all direct grid children — wrapping them would have
// collapsed those layouts).
//
// Animates opacity + transform only, so nothing reflows and it contributes no
// CLS. `once: true` means it runs a single time and never re-triggers.
//
// prefers-reduced-motion is handled in globals.css via `[data-reveal]`, not a
// JS hook: useReducedMotion resolves after the first render, which would let
// one animated frame through before it took effect.

interface RevealProps extends Omit<HTMLMotionProps<"div">, "initial" | "whileInView" | "viewport" | "transition"> {
  /** Seconds to hold before starting — used to stagger siblings. */
  delay?: number;
}

export function Reveal({ children, delay = 0, ...props }: RevealProps) {
  return (
    <motion.div
      data-reveal
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      // amount 0.15 + a negative bottom margin starts the reveal slightly
      // before the block is fully on screen, so it reads as already settling
      // as you scroll to it rather than popping once it is centred.
      viewport={{ once: true, amount: 0.15, margin: "0px 0px -80px 0px" }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
