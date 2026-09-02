"use client";

import { motion } from "framer-motion";
import { RotatingQuote } from "@/components/ui/RotatingQuote";

/**
 * The worded half of the sign-in screen, on white.
 *
 * No logo: the navbar carries it directly above this panel, and a second copy
 * a few hundred pixels below the first is repetition, not branding.
 *
 * No ship either. It was a watermark competing with the rotating headline for
 * the same attention, in a column whose whole job is to be read.
 *
 * White rather than gradient, because this is the half people read and dark
 * text on white is simply easier than white text on a moving gradient. The
 * gradient lives in the other column, where it gives the card something to
 * glow against.
 */
export function LoginBrandPanel() {
  return (
    <div className="w-full px-8 py-14 sm:px-12 lg:px-16 lg:py-20">
      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mb-6 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.28em] text-brand"
      >
        <span className="h-px w-8 bg-brand/40" />
        Affhan Group
      </motion.p>

      <RotatingQuote />
    </div>
  );
}
