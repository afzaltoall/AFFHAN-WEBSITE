"use client";

import { Almarai } from "next/font/google";
import { cn } from "@/lib/utils";
import { motion, useScroll, useTransform, useMotionValueEvent, useReducedMotion } from "framer-motion";
import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { scrollToId } from "@/lib/scroll";

// latin only — the page renders no Arabic text, and the arabic subset is a
// large glyph set that would be downloaded and never drawn.
//
// 400/700 only. Almarai has no 500 or 600 face, so the font-medium and
// font-semibold used in this section resolve to 400 and 700 anyway.
const almarai = Almarai({ weight: ["400", "700"], subsets: ["latin"] });

/**
 * The careers statement, told by scrolling rather than by a video.
 *
 * This section used to sit on an autoplaying loop with a noise layer and two
 * gradient scrims stacked over it — machinery that existed only to claw back
 * enough contrast to read text off moving footage. With the video gone none of
 * it is needed, so the words carry the section on their own.
 *
 * Two columns, because one left the right half of a wide screen empty. The
 * asterisk after the title is not decoration: the right column is the
 * footnote, and it answers the question the headline raises.
 *
 * Palette measured rather than picked. On #FAFAF7 the lit navy is 15.7:1 and
 * the unlit grey is 4.59:1 — so a word that has not been reached yet is still
 * comfortably readable, which matters because a reader who stops mid-section
 * would otherwise be looking at text below the accessible threshold. The
 * reveal is a darkening from one legible tone to another, not a fade from
 * nothing.
 */

const COPY =
  "Real ownership from day one. Learn the craft of sourcing, QC and freight from a team that's been shipping since 2000 — and rise as fast as your ambition. Here, what you can do matters more than where you're from.";

const WORDS = COPY.split(" ");

/**
 * The footnote. Every line is something the site already says elsewhere —
 * the four disciplines come straight out of the sentence on the left, and the
 * freight line is the same one the UK and China pages make.
 */
const DISCIPLINES = [
  { name: "Sourcing", note: "Find the factory, and prove it actually makes the thing." },
  { name: "Quality", note: "Inspect it in the supplier's building, while a fault is still theirs." },
  { name: "Freight", note: "Sea, air and rail, priced side by side rather than one quoted." },
  { name: "Customs", note: "The declaration filed at both ends, not handed back to you." },
];

const FACTS = ["Trading since 2000", "7 offices", "190+ markets"];

export function PrismaHero() {
  const trackRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });

  /* Two update paths, because the two halves of this section cost very
     different amounts to redraw.

     The forty words are written straight to the DOM below, outside React. The
     footnote rows, the fact line and the button are half a dozen elements, so
     they stay on state — quantised to fiftieths, which is fifty re-renders
     across the whole scroll instead of one per frame. Rounding to thousandths
     as before meant a re-render on very nearly every frame, and each one
     rebuilt the style object of all forty words as well. */
  const [raw, setRaw] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const next = Math.round(v * 50) / 50;
    setRaw((prev) => (prev === next ? prev : next));
  });
  // With reduced motion the section is simply fully revealed.
  const p = reduced ? 1 : raw;

  const titleScale = useTransform(scrollYProgress, [0, 0.3], [0.94, 1]);
  const titleY = useTransform(scrollYProgress, [0, 0.3], ["10%", "0%"]);

  // Choreography, in scroll progress.
  const READ_FROM = 0.14;
  const READ_TO = 0.56;
  const LIST_FROM = 0.54;
  const LIST_TO = 0.86;

  // Each word lifts over three word-widths, so several are always in motion
  // and the sentence reads as a wave rather than a row of switches.
  const span = (READ_TO - READ_FROM) / WORDS.length;

  const rowLit = (i: number) => {
    if (reduced) return 1;
    const each = (LIST_TO - LIST_FROM) / DISCIPLINES.length;
    return Math.min(1, Math.max(0, (p - (LIST_FROM + i * each)) / (each * 1.6)));
  };

  const factsLit = reduced ? 1 : Math.min(1, Math.max(0, (p - 0.84) / 0.06));
  const ctaLit = reduced ? 1 : Math.min(1, Math.max(0, (p - 0.88) / 0.06));

  /* Lit navy and unlit grey, both measured against the background above.

     No transition. There was one — color and transform over 0.2s — and it was
     actively harmful: the value behind it was being replaced on every scroll
     frame, so the browser was running forty colour interpolations that never
     reached their target before the next one arrived. Scroll position already
     supplies the smoothness; the transition only added work. */
  const ink = (lit: number) => ({
    color: `color-mix(in srgb, #08222e ${Math.round(lit * 100)}%, #63757d)`,
    transform: `translateY(${(1 - lit) * 5}px)`,
  });

  /* The words are painted by hand, not by React.

     Changing a word's colour re-rasterises its text, and there are forty of
     them. Driving that through state meant React reconciling forty elements
     and the compositor repainting all forty on every frame of a scroll, even
     though at any moment only the three or four words inside the wave are
     actually changing.

     So each span keeps a ref, and the scroll handler writes only the ones
     whose value has moved. Quantised to twenty-five steps: finer than the eye
     resolves across a word's reveal, and it collapses a continuous stream of
     repaints into a couple of dozen per word for the whole section. */
  const wordEls = useRef<(HTMLSpanElement | null)[]>([]);
  const wordStep = useRef<number[]>([]);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (reduced) return;
    for (let i = 0; i < WORDS.length; i += 1) {
      const el = wordEls.current[i];
      if (!el) continue;
      const t = (v - (READ_FROM + i * span)) / (span * 3);
      const lit = t < 0 ? 0 : t > 1 ? 1 : t;
      const step = Math.round(lit * 25);
      if (wordStep.current[i] === step) continue;
      wordStep.current[i] = step;
      const pct = step * 4;
      el.style.color = `color-mix(in srgb, #08222e ${pct}%, #63757d)`;
      el.style.transform = `translateY(${((100 - pct) / 100) * 5}px)`;
    }
  });

  return (
    <section
      ref={trackRef}
      className={cn("relative h-[280vh] bg-[#FAFAF7] sm:h-[320vh]", almarai.className)}
    >
      {/* top-16 and a matching height, because the site navbar is fixed at
          the top and 4rem tall. Sticking to top-0 and sizing to h-screen
          centres the content against the whole viewport, which pushed the top
          of a title this large up underneath the bar. */}
      <div className="sticky top-16 flex h-[calc(100vh-4rem)] items-center overflow-hidden">
        <div className="mx-auto w-full max-w-[1500px] px-6 py-10 md:px-12 lg:px-16">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-14">
            {/* ---- Left: the word, and the sentence that unlocks it ---- */}
            <div className="lg:col-span-7">
              <motion.h2
                style={{ scale: titleScale, y: titleY }}
                className="origin-bottom-left text-[19vw] font-medium leading-[0.84] tracking-[-0.055em] text-[#08222e] sm:text-[17vw] lg:text-[11.5vw]"
              >
                Careers
                <span className="align-super text-[0.26em] text-[#176579]">*</span>
              </motion.h2>

              <p className="mt-7 max-w-2xl text-[17px] font-medium leading-[1.7] sm:text-xl md:text-[22px] md:leading-[1.65]">
                {WORDS.map((word, i) => (
                  <span
                    key={`${word}-${i}`}
                    ref={(el) => {
                      wordEls.current[i] = el;
                    }}
                    className="inline-block whitespace-pre"
                    style={ink(reduced ? 1 : 0)}
                  >
                    {word}
                    {i < WORDS.length - 1 ? " " : ""}
                  </span>
                ))}
              </p>

              {/* The button lives here rather than under the footnote: the
                  right column carries four entries and a fact line, so keeping
                  the call to action on the left is what stops one half of the
                  composition running a screen deeper than the other. */}
              <div
                style={{
                  opacity: ctaLit,
                  transform: `translateY(${(1 - ctaLit) * 12}px)`,
                  transition: "opacity 0.25s ease-out, transform 0.5s cubic-bezier(0.16,1,0.3,1)",
                  pointerEvents: ctaLit < 0.05 ? "none" : "auto",
                }}
              >
                <button
                  onClick={() => scrollToId("roles")}
                  className="group mt-9 flex cursor-pointer items-center gap-2 rounded-full bg-[#08222e] py-1.5 pl-6 pr-1.5 transition-all duration-300 hover:gap-3"
                >
                  <span className="whitespace-nowrap text-sm font-medium text-[#FAFAF7] sm:text-base">Explore roles</span>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FAFAF7] transition-transform duration-300 group-hover:scale-110 sm:h-10 sm:w-10">
                    <ArrowRight className="h-4 w-4 text-[#08222e] sm:h-5 sm:w-5" />
                  </div>
                </button>
              </div>
            </div>

            {/* ---- Right: the footnote the asterisk promised ---- */}
            <div className="lg:col-span-5">
              <p
                className="text-[11.5px] font-bold uppercase tracking-[0.22em] text-[#5a6e77]"
                style={{ opacity: reduced ? 1 : Math.min(1, Math.max(0, (p - 0.5) / 0.06)) }}
              >
                <span className="text-[#176579]">*</span> What that actually means
              </p>

              <ul className="mt-6 space-y-0">
                {DISCIPLINES.map((d, i) => {
                  const lit = rowLit(i);
                  return (
                    <li
                      key={d.name}
                      className="border-t border-[#08222e]/12 py-4 first:border-t-0 first:pt-0 sm:py-5"
                      style={{
                        opacity: 0.35 + lit * 0.65,
                        transform: `translateY(${(1 - lit) * 10}px)`,
                        transition: "opacity 0.25s ease-out, transform 0.45s cubic-bezier(0.16,1,0.3,1)",
                      }}
                    >
                      <p className="text-[17px] font-bold leading-tight text-[#08222e] sm:text-lg">{d.name}</p>
                      <p className="mt-1.5 text-[14.5px] leading-[1.55] text-[#5a6e77] sm:text-[15px]">{d.note}</p>
                    </li>
                  );
                })}
              </ul>

              <div
                className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[#08222e]/12 pt-6"
                style={{
                  opacity: factsLit,
                  transform: `translateY(${(1 - factsLit) * 10}px)`,
                  transition: "opacity 0.25s ease-out, transform 0.45s cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                {FACTS.map((f, i) => (
                  <span key={f} className="flex items-center gap-3">
                    {i > 0 && <span aria-hidden="true" className="text-[#08222e]/25">·</span>}
                    <span className="text-[13px] font-bold uppercase tracking-[0.14em] text-[#5a6e77]">{f}</span>
                  </span>
                ))}
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
