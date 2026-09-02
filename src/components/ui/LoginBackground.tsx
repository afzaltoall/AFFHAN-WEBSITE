"use client";

import { motion } from "framer-motion";

/**
 * The ambient backdrop behind the sign-in screen.
 *
 * Adapted from a purple reference to the brand teal — the shapes and timings
 * are the useful part, the colour was not. Everything here is decorative and
 * aria-hidden; nothing announces itself to a screen reader.
 *
 * All of it animates opacity, scale and transform only, so a page that sits
 * open while someone types is not repainting layout on every frame.
 */
export function LoginBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Base wash, deep at the foot so the card has something to sit against. */}
      <div className="absolute inset-0 bg-gradient-to-b from-brand via-brand-dark to-[#0b2f3a]" />

      {/* Film grain. Without it a large flat gradient bands visibly on cheap
          panels; at 3% it is invisible as texture and does its job anyway. */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-soft-light"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: "200px 200px",
        }}
      />

      {/* Two slow breathing glows on different periods, so they never fall into
          an obvious shared rhythm while someone is filling in the form. */}
      <motion.div
        className="absolute -top-[10vh] left-1/2 h-[70vh] w-[110vh] -translate-x-1/2 rounded-b-full bg-white/10 blur-[90px]"
        animate={{ opacity: [0.14, 0.28, 0.14], scale: [0.98, 1.03, 0.98] }}
        transition={{ duration: 9, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-[20vh] left-1/3 h-[80vh] w-[80vh] -translate-x-1/2 rounded-full bg-brand/40 blur-[100px]"
        animate={{ opacity: [0.25, 0.45, 0.25], scale: [1, 1.08, 1] }}
        transition={{
          duration: 7,
          repeat: Infinity,
          repeatType: "mirror",
          ease: "easeInOut",
          delay: 1.2,
        }}
      />
      <motion.div
        className="absolute right-[8%] top-1/3 h-[46vh] w-[46vh] rounded-full bg-white/5 blur-[110px]"
        animate={{ opacity: [0.3, 0.55, 0.3], x: [0, 26, 0] }}
        transition={{
          duration: 12,
          repeat: Infinity,
          repeatType: "mirror",
          ease: "easeInOut",
        }}
      />
    </div>
  );
}
