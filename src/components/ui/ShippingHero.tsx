"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion, useMotionValueEvent, useScroll, useTransform } from "framer-motion";
import { useScrollLit, ink } from "./scrollLit";

const HEADING = "Freight forwarding and NVOCC services, from the factory floor to your warehouse";
const WORDS = HEADING.split(" ");

export function ShippingHero({ officeCount }: { officeCount: number }) {
  const trackRef = useRef<HTMLElement>(null);
  const { p, reduced, scrollYProgress } = useScrollLit(trackRef, ["start start", "end end"]);

  const READ_FROM = 0.05;
  const READ_TO = 0.5;
  const span = (READ_TO - READ_FROM) / WORDS.length;

  const titleScale = useTransform(scrollYProgress, [0, 0.4], [1, 0.85]);
  const titleY = useTransform(scrollYProgress, [0, 0.4], ["0%", "5%"]);
  const imageY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  
  const pLit = reduced ? 1 : Math.min(1, Math.max(0, (p - 0.45) / 0.15));
  const ctaLit = reduced ? 1 : Math.min(1, Math.max(0, (p - 0.55) / 0.15));

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
      className="relative h-[240vh] bg-[#FAFAF7] sm:h-[280vh]"
    >
      <div className="sticky top-16 flex h-[calc(100vh-4rem)] items-center overflow-hidden">
        
        {/* Abstract ship background */}
        <motion.div 
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-[20%] opacity-[0.03] pointer-events-none mix-blend-multiply filter blur-[2px]"
          style={{ y: imageY }}
        >
          <Image
            src="/affhan-ship.png"
            alt=""
            aria-hidden="true"
            /* Square, because the mark is. It was 1200x960 for the old
               450x360 ship silhouette; the replacement logo is 1:1, and a
               mismatched width/height makes Next reserve the wrong aspect box
               and shift when the real image lands. */
            width={1200}
            height={448}
            priority
            className="w-[80vw] h-auto object-contain max-w-[1200px]"
          />
        </motion.div>

        <div className="mx-auto w-full max-w-[1500px] px-6 py-10 md:px-12 lg:px-16 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14">
            
            {/* The main typographic reveal */}
            <div className="lg:col-span-8 xl:col-span-9">
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#176579]">
                Affhan Shipping
              </span>
              
              <motion.h1
                style={{ scale: reduced ? 1 : titleScale, y: reduced ? 0 : titleY, transformOrigin: "left center" }}
                className="mt-6 text-[11vw] font-medium leading-[0.9] tracking-[-0.04em] text-[#08222e] sm:text-[9vw] lg:text-[7vw]"
              >
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
              </motion.h1>
            </div>

            {/* The supporting text and CTA, revealed after the heading */}
            <div className="lg:col-span-4 xl:col-span-3 lg:self-end pb-4 lg:pb-12">
              <div
                style={{
                  opacity: pLit,
                  transform: `translateY(${(1 - pLit) * 20}px)`,
                  transition: "opacity 0.25s ease-out, transform 0.5s cubic-bezier(0.16,1,0.3,1)"
                }}
              >
                <p className="text-[16px] font-medium leading-[1.6] text-[#5a6e77] sm:text-[18px]">
                  Sea and air freight, customs clearance and inland delivery, run out of
                  our own offices in {officeCount} countries. The same team that sources
                  your goods can move them.
                </p>
              </div>

              <div
                style={{
                  opacity: ctaLit,
                  transform: `translateY(${(1 - ctaLit) * 20}px)`,
                  transition: "opacity 0.25s ease-out, transform 0.5s cubic-bezier(0.16,1,0.3,1)",
                  pointerEvents: ctaLit < 0.05 ? "none" : "auto",
                }}
                className="mt-10 flex flex-col items-start gap-4"
              >
                <Link
                  href="/contact/"
                  className="group flex cursor-pointer items-center gap-2 rounded-full bg-[#08222e] py-1.5 pl-6 pr-1.5 transition-all duration-300 hover:gap-3"
                >
                  <span className="whitespace-nowrap text-sm font-medium text-[#FAFAF7] sm:text-base">Request a quote</span>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FAFAF7] transition-transform duration-300 group-hover:scale-110 sm:h-10 sm:w-10">
                    <ArrowRight className="h-4 w-4 text-[#08222e] sm:h-5 sm:w-5" />
                  </div>
                </Link>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
