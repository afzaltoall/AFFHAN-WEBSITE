"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { SHIP_MARK_HERO } from "@/lib/shipMarkAssets";

const HEADING = "Freight forwarding and NVOCC services, from the factory floor to your warehouse";
const WORDS = HEADING.split(" ");

export function ShippingHero({ officeCount }: { officeCount: number }) {
  // --- Interactive Effects ---
  const [mouseGradientStyle, setMouseGradientStyle] = useState({
    left: '0px',
    top: '0px',
    opacity: 0,
  });
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMouseGradientStyle({
        left: `${e.clientX}px`,
        top: `${e.clientY}px`,
        opacity: 1,
      });
    };
    const handleMouseLeave = () => {
      setMouseGradientStyle(prev => ({ ...prev, opacity: 0 }));
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const newRipple = { id: Date.now(), x: e.clientX, y: e.clientY };
      setRipples(prev => [...prev, newRipple]);
      setTimeout(() => setRipples(prev => prev.filter(r => r.id !== newRipple.id)), 1000);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const pageStyles = `
    #mouse-gradient-hero {
      position: fixed;
      pointer-events: none;
      border-radius: 9999px;
      background-image: radial-gradient(circle, rgba(23, 101, 121, 0.08), rgba(23, 101, 121, 0.02), transparent 70%);
      transform: translate(-50%, -50%);
      will-change: left, top, opacity;
      transition: left 70ms linear, top 70ms linear, opacity 300ms ease-out;
      z-index: 10;
    }
    @keyframes grid-draw { 0% { stroke-dashoffset: 1000; opacity: 0; } 50% { opacity: 0.3; } 100% { stroke-dashoffset: 0; opacity: 0.15; } }
    @keyframes pulse-glow { 0%, 100% { opacity: 0.2; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.1); } }
    .grid-line { stroke: #176579; stroke-width: 0.5; opacity: 0; stroke-dasharray: 5 5; stroke-dashoffset: 1000; animation: grid-draw 2s ease-out forwards; }
    .detail-dot { fill: #176579; opacity: 0; animation: pulse-glow 3s ease-in-out infinite; }
    .floating-element-animate { position: absolute; width: 2px; height: 2px; background: #176579; border-radius: 50%; opacity: 0; animation: float 4s ease-in-out infinite; animation-play-state: running; }
    @keyframes float { 0%, 100% { transform: translateY(0) translateX(0); opacity: 0.3; } 25% { transform: translateY(-10px) translateX(5px); opacity: 0.7; } 50% { transform: translateY(-5px) translateX(-3px); opacity: 0.5; } 75% { transform: translateY(-15px) translateX(7px); opacity: 0.9; } }
    .ripple-effect { position: fixed; width: 4px; height: 4px; background: rgba(23, 101, 121, 0.6); border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none; animation: pulse-glow-ripple 1s ease-out forwards; z-index: 9999; }
    @keyframes pulse-glow-ripple { 0% { opacity: 0.8; transform: translate(-50%, -50%) scale(1); box-shadow: 0 0 0 0 rgba(23, 101, 121, 0.4); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(20); box-shadow: 0 0 0 20px rgba(23, 101, 121, 0); } }
  `;

  // Framer Motion Variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const wordVariants = {
    hidden: { opacity: 0, y: 30, filter: 'blur(8px)' },
    visible: {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: {
        duration: 0.8,
        ease: [0.16, 1, 0.3, 1] as const
      }
    },
  };

  const fadeUpVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: [0.16, 1, 0.3, 1] as const,
        delay: 1.8 // Appear after heading
      }
    },
  };

  return (
    <>
      <style>{pageStyles}</style>

      {/* Mouse Gradient & Ripples */}
      <div
        id="mouse-gradient-hero"
        className="w-60 h-60 blur-xl sm:w-80 sm:h-80 sm:blur-2xl md:w-96 md:h-96 md:blur-3xl"
        style={{
          left: mouseGradientStyle.left,
          top: mouseGradientStyle.top,
          opacity: mouseGradientStyle.opacity,
        }}
      ></div>

      {ripples.map(ripple => (
        <div
          key={ripple.id}
          className="ripple-effect"
          style={{ left: `${ripple.x}px`, top: `${ripple.y}px` }}
        ></div>
      ))}

      <section
        className="relative min-h-screen bg-[#FAFAF7] overflow-hidden flex items-center pt-24 pb-16"
      >
        {/* Animated Background Grid & Particles */}
        <div className="absolute inset-0 w-full h-full pointer-events-none z-0">
          <svg className="absolute inset-0 w-full h-full opacity-30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <pattern id="gridHeroLightResponsive" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(23, 101, 121, 0.05)" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#gridHeroLightResponsive)" />
            <line x1="0" y1="20%" x2="100%" y2="20%" className="grid-line" style={{ animationDelay: '0.5s' }} />
            <line x1="0" y1="80%" x2="100%" y2="80%" className="grid-line" style={{ animationDelay: '1s' }} />
            <line x1="20%" y1="0" x2="20%" y2="100%" className="grid-line" style={{ animationDelay: '1.5s' }} />
            <line x1="80%" y1="0" x2="80%" y2="100%" className="grid-line" style={{ animationDelay: '2s' }} />
            <line x1="50%" y1="0" x2="50%" y2="100%" className="grid-line" style={{ animationDelay: '2.5s', opacity: '0.05' }} />
            <line x1="0" y1="50%" x2="100%" y2="50%" className="grid-line" style={{ animationDelay: '3s', opacity: '0.05' }} />
            <circle cx="20%" cy="20%" r="2" className="detail-dot" style={{ animationDelay: '3s' }} />
            <circle cx="80%" cy="20%" r="2" className="detail-dot" style={{ animationDelay: '3.2s' }} />
            <circle cx="20%" cy="80%" r="2" className="detail-dot" style={{ animationDelay: '3.4s' }} />
            <circle cx="80%" cy="80%" r="2" className="detail-dot" style={{ animationDelay: '3.6s' }} />
            <circle cx="50%" cy="50%" r="1.5" className="detail-dot" style={{ animationDelay: '4s' }} />
          </svg>
          <div className="floating-element-animate" style={{ top: '25%', left: '15%', animationDelay: '0.5s' }}></div>
          <div className="floating-element-animate" style={{ top: '60%', left: '85%', animationDelay: '1s' }}></div>
          <div className="floating-element-animate" style={{ top: '40%', left: '10%', animationDelay: '1.5s' }}></div>
          <div className="floating-element-animate" style={{ top: '75%', left: '90%', animationDelay: '2s' }}></div>
        </div>

        <div className="mx-auto w-full max-w-[1500px] px-6 md:px-12 lg:px-16 relative z-20 pointer-events-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">

            {/* The main typographic reveal */}
            <div className="lg:col-span-8 xl:col-span-9">
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1 }}
                className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#176579]"
              >
                Affhan Shipping
              </motion.span>

              <motion.h1
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="mt-6 text-[10vw] font-medium leading-[1.05] tracking-[-0.04em] text-[#08222e] sm:text-[8vw] lg:text-[6.5vw]"
              >
                {WORDS.map((word, i) => (
                  <motion.span
                    key={`${word}-${i}`}
                    variants={wordVariants}
                    className="inline-block whitespace-pre transition-transform duration-300 hover:-translate-y-2 hover:text-[#176579] cursor-default"
                  >
                    {word}
                    {i < WORDS.length - 1 ? " " : ""}
                  </motion.span>
                ))}
              </motion.h1>
            </div>

            {/* The supporting text and CTA, revealed after the heading */}
            <motion.div
              className="lg:col-span-4 xl:col-span-3 lg:self-end pb-4 lg:pb-12"
              variants={fadeUpVariants}
              initial="hidden"
              animate="visible"
            >
              {/* The ship mark, above the copy rather than behind it.

                  It used to be a 1200px watermark at 3% opacity, blurred and
                  multiply-blended, parked behind this column. That only ever
                  worked for a wide mark faint enough to read as texture. The
                  square emblem that replaced it sat squarely behind the
                  paragraph and the button, and any render that let it through
                  at more than a whisper put the copy on top of the logo.

                  In this column's own flow, so it can neither overlap the copy
                  nor ride up under the fixed navbar: where the heading leaves
                  room above the copy it takes that room, and where it does not,
                  the row grows instead. Placed absolutely off the column's top
                  edge it cleared the text everywhere, but slid 13-35px under
                  the navbar on 720-768px-tall laptops. Capped at the column,
                  260px and 28vh; shown plainly, since a faint mark this size is
                  simply invisible; lg and up only, since stacked in one column
                  the only space above the copy is the heading. Not
                  priority-loaded: it is decoration, and a phone never shows it. */}
              <Image
                {...SHIP_MARK_HERO}
                alt=""
                aria-hidden="true"
                className="mb-8 hidden h-auto w-[min(100%,260px,28vh)] lg:block"
              />

              <div>
                <p className="text-[16px] font-medium leading-[1.6] text-[#5a6e77] sm:text-[18px]">
                  Sea and air freight, customs clearance and inland delivery, run out of
                  our own offices in {officeCount} countries. The same team that sources
                  your goods can move them.
                </p>
              </div>

              <div className="mt-10 flex flex-col items-start gap-4 relative z-50">
                {/* To the freight quote form at the foot of the page. */}
                <Link
                  href="#shipping-quote"
                  className="group flex cursor-pointer items-center gap-2 rounded-full bg-[#08222e] py-1.5 pl-6 pr-1.5 transition-all duration-300 hover:gap-3 hover:bg-[#176579] hover:shadow-lg hover:shadow-[#176579]/20"
                >
                  <span className="whitespace-nowrap text-sm font-medium text-[#FAFAF7] sm:text-base">Request a quote</span>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FAFAF7] transition-transform duration-300 group-hover:scale-110 sm:h-10 sm:w-10">
                    <ArrowRight className="h-4 w-4 text-[#08222e] sm:h-5 sm:w-5 group-hover:text-[#176579]" />
                  </div>
                </Link>
              </div>
            </motion.div>

          </div>
        </div>
      </section>
    </>
  );
}
