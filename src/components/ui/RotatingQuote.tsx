"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * The headline on the sign-in screen, cycling through a few things worth
 * knowing about the business, with its own supporting facts changing beneath
 * it.
 *
 * Every line is checkable — six named offices, in business since 2000,
 * sourcing and freight from one team. Nothing about tonnage, shipment counts
 * or client numbers, because nobody has given me a source for those and
 * invented figures have gone live on this site before.
 *
 * Words animate in individually rather than the block fading as one. A single
 * fade reads as a slide change; a stagger reads as writing, which is what holds
 * attention on a screen where someone is waiting for an SMS.
 */
interface Quote {
  lead: string;
  accent: string;
  sub: string;
  facts: string[];
}

const QUOTES: Quote[] = [
  {
    lead: "Global B2B sourcing and",
    accent: "freight forwarding",
    sub: "Source from China and 100+ countries, and move it with the same team.",
    facts: ["6 offices worldwide", "Since 2000", "Sea & air freight"],
  },
  {
    lead: "One team, from the factory floor to",
    accent: "your warehouse",
    sub: "The people who inspect your goods are the people who book the container.",
    facts: ["Sourcing & QC", "Customs clearance", "Door to door"],
  },
  {
    lead: "Six offices. One",
    accent: "point of contact",
    sub: "Chennai, Guangzhou, Dubai, Singapore, Malaysia and London — ours, not agents.",
    facts: ["Chennai HQ", "Guangzhou desk", "London · Dubai · Singapore"],
  },
  {
    lead: "Sourcing and shipping, together",
    accent: "since 2000",
    sub: "Twenty-five years of moving goods for importers who would rather ask one company.",
    facts: ["25 years", "NVOCC", "100+ countries"],
  },
];

const ROTATE_MS = 5600;

const word = {
  hidden: { opacity: 0, y: 22, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -14, filter: "blur(4px)" },
};

export function RotatingQuote() {
  const [index, setIndex] = useState(0);
  const [rotating, setRotating] = useState(true);

  const go = useCallback((i: number) => setIndex(((i % QUOTES.length) + QUOTES.length) % QUOTES.length), []);

  // Someone who asked for less motion gets the first line and no carousel — a
  // headline that rewrites itself every few seconds is exactly what that
  // preference is about.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const decide = () => setRotating(!mq.matches);
    decide();
    mq.addEventListener("change", decide);
    return () => mq.removeEventListener("change", decide);
  }, []);

  // One timer drives the index; the bar below is keyed to that same index and
  // runs for the same duration, so the two start together and finish together
  // by construction.
  //
  // The alternative — advancing when the bar's animation reports completion —
  // reads better on paper but hangs the whole carousel on a requestAnimationFrame
  // callback. A backgrounded tab stops delivering those, and the panel would sit
  // on one statement with a half-drawn line under it until the tab came back.
  useEffect(() => {
    if (!rotating) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % QUOTES.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [rotating, index]);

  const quote = QUOTES[index];
  const leadWords = quote.lead.split(" ");
  const accentWords = quote.accent.split(" ");

  return (
    <div className="relative">
      {/* Fixed minimum heights on each block so nothing below shifts as the
          lines change length — a panel that reflows every five seconds is
          worse than no animation at all. */}
      <div className="min-h-[7.5rem] lg:min-h-[10.5rem]">
        <AnimatePresence mode="wait">
          <motion.h2
            key={index}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={{ staggerChildren: 0.045 }}
            className="max-w-md text-3xl font-bold leading-[1.22] tracking-tight text-slate-900 lg:text-[2.6rem]"
          >
            {leadWords.map((w, i) => (
              <motion.span
                key={`l-${i}`}
                variants={word}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="inline-block pb-[0.14em] -mb-[0.14em]"
              >
                {w}&nbsp;
              </motion.span>
            ))}
            {accentWords.map((w, i) => (
              <motion.span
                key={`a-${i}`}
                variants={word}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="inline-block bg-gradient-to-r from-brand to-brand-dark bg-clip-text pb-[0.14em] -mb-[0.14em] text-transparent"
              >
                {w}&nbsp;
              </motion.span>
            ))}
          </motion.h2>
        </AnimatePresence>
      </div>

      <div className="min-h-[3.25rem]">
        <AnimatePresence mode="wait">
          <motion.p
            key={`sub-${index}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.18 }}
            className="mt-3 max-w-md text-[15px] leading-relaxed text-slate-500"
          >
            {quote.sub}
          </motion.p>
        </AnimatePresence>
      </div>

      {rotating && (
        <div className="mt-6 flex items-center gap-2">
          {QUOTES.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              aria-label={`Show statement ${i + 1}`}
              aria-current={i === index}
              className="group w-14 py-2 cursor-pointer"
            >
              <span className="block h-[3px] w-full overflow-hidden rounded-full bg-slate-200 transition-colors group-hover:bg-slate-300">
                {i === index ? (
                  <motion.span
                    // Keyed on the index so a click restarts the run rather
                    // than resuming a bar that was already part-way through.
                    // The index is advanced by the timer above, not by this
                    // finishing — the two simply share a duration.
                    key={`fill-${index}`}
                    className="block h-full rounded-full bg-brand"
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: ROTATE_MS / 1000, ease: "linear" }}
                  />
                ) : (
                  // Bars already read stay filled, so the row shows how far
                  // through the set you are rather than only where you are.
                  <span
                    className={`block h-full rounded-full bg-brand/35 transition-all duration-500 ${
                      i < index ? "w-full" : "w-0"
                    }`}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* The facts change with the statement above them, one after the other,
          so the row reads as part of the same thought rather than a fixed
          footer that happens to sit underneath. */}
      <div className="mt-7 min-h-[2.5rem] border-t border-slate-100 pt-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={`facts-${index}`}
            initial="hidden"
            animate="show"
            exit="exit"
            transition={{ staggerChildren: 0.08, delayChildren: 0.22 }}
            className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-slate-500"
          >
            {quote.facts.map((f, i) => (
              <motion.span
                key={f}
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  show: { opacity: 1, y: 0 },
                  exit: { opacity: 0, y: -6 },
                }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-center gap-5"
              >
                {i > 0 && <span className="h-1 w-1 rounded-full bg-slate-300" />}
                {f}
              </motion.span>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
