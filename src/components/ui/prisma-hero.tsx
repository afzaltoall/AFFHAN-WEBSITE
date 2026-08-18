"use client";

import { Almarai } from "next/font/google";
import { cn } from "@/lib/utils";
import { WordsPullUp } from "./words-pull-up";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { scrollToId } from "@/lib/scroll";

const almarai = Almarai({ weight: ["300", "400", "700", "800"], subsets: ["arabic", "latin"] });

export function PrismaHero() {
  const containerRef = useRef<HTMLElement>(null);
  
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "center center"]
  });

  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
  const y = useTransform(scrollYProgress, [0, 1], ["8%", "0%"]);
  const borderRadius = useTransform(scrollYProgress, [0, 1], ["2.5rem", "0rem"]);

  return (
    <section 
      ref={containerRef}
      className={cn(
        "relative flex min-h-screen flex-col bg-white justify-center items-center overflow-hidden",
        almarai.className
      )}
      style={{
        "--primary": "222, 219, 200", // #DEDBC8
      } as React.CSSProperties}
    >
      <motion.div 
        style={{ scale, y, borderRadius }}
        className="relative w-full h-screen overflow-hidden shadow-2xl"
      >
        
        {/* Background Video */}
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          poster="/career-video/Career-2-poster.jpg"
          className="absolute inset-0 w-full h-full object-cover z-0"
          src="/career-video/Career-2.mp4"
        />

        {/* Noise overlay */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.7] mix-blend-overlay pointer-events-none z-10"
          xmlns="http://www.w3.org/2000/svg"
        >
          <filter id="noiseFilterHero">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves="3"
              stitchTiles="stitch"
            />
          </filter>
          <rect width="100%" height="100%" filter="url(#noiseFilterHero)" />
        </svg>

        {/* Gradient overlay — darker at the bottom where the title + copy sit */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/85 z-10" />
        {/* Extra scrim behind the right-hand copy so it stays legible over the
            bright clouds. Full-height + horizontal-only fade so it leaves no
            visible seam across the image. */}
        <div className="absolute inset-y-0 right-0 w-full md:w-2/3 bg-gradient-to-l from-black/60 via-black/20 to-transparent z-10 pointer-events-none" />

        {/* Hero Content */}
        <div className="absolute bottom-0 left-0 right-0 z-20 p-6 md:p-12 lg:p-16">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-end">
            {/* Left column: Heading */}
            <div className="md:col-span-8">
              <WordsPullUp
                text="Careers"
                showAsterisk
                className="text-[26vw] sm:text-[24vw] md:text-[22vw] lg:text-[20vw] xl:text-[19vw] 2xl:text-[20vw] font-medium leading-[0.85] tracking-[-0.07em] text-[#E1E0CC]"
              />
            </div>
            
            {/* Right column: Description & Button */}
            <div className="md:col-span-4 flex flex-col items-start md:items-end text-left md:text-right pb-4 md:pb-8">
              <motion.p
                className="text-[#F3F1E3] text-sm sm:text-base md:text-base leading-[1.35] max-w-[300px] font-medium [text-shadow:_0_2px_10px_rgba(0,0,0,0.85)]"
                initial={{ opacity: 0, x: 60, y: -40 }}
                whileInView={{ opacity: 1, x: 0, y: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              >
Real ownership from day one. Learn the craft of sourcing, QC and freight from a team that&apos;s been shipping since 2000 &mdash; and rise as fast as your ambition. Here, what you can do matters more than where you&apos;re from.
              </motion.p>
              
              <motion.button 
                onClick={() => scrollToId("roles")}
                className="group mt-8 flex items-center gap-2 bg-[#DEDBC8] rounded-full pl-6 pr-1.5 py-1.5 hover:gap-3 transition-all duration-300 cursor-pointer"
                initial={{ opacity: 0, x: 60, y: -30 }}
                whileInView={{ opacity: 1, x: 0, y: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ delay: 0.15, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="text-black font-medium text-sm sm:text-base whitespace-nowrap">Explore roles</span>
                <div className="bg-black rounded-full w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shrink-0">
                  <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-[#DEDBC8]" />
                </div>
              </motion.button>
            </div>
          </div>
        </div>

      </motion.div>
    </section>
  );
}
