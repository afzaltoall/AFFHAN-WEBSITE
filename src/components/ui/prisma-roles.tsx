"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Check, ArrowRight, Package, ShieldCheck, Ship, Handshake } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Almarai } from "next/font/google";
import { cn } from "@/lib/utils";
import { WordsPullUpMultiStyle } from "./words-pull-up";

// latin only — the page renders no Arabic text, and the arabic subset is a
// large glyph set that would be downloaded and never drawn.
//
// 400/700 only. Almarai has no 500 or 600 face, so the font-normal and
// font-semibold used in this section resolve to 400 and 700 anyway; declaring
// 300 and 800 as well just preloaded two files nothing ever renders.
const almarai = Almarai({ weight: ["400", "700"], subsets: ["latin"] });

// Affhan open positions across our global sourcing network.
const ROLES: {
  id: string;
  title: string;
  location: string;
  Icon: LucideIcon;
  features: string[];
}[] = [
  {
    id: "01",
    title: "Sourcing Specialist",
    location: "Guangzhou / Chennai",
    Icon: Package,
    features: [
      "Build and manage Chinese supplier relationships",
      "Negotiate pricing, MOQs and lead times",
      "Source products to match client requirements",
    ],
  },
  {
    id: "02",
    title: "Quality Control Inspector",
    location: "Guangzhou",
    Icon: ShieldCheck,
    features: [
      "Conduct on-site factory inspections and audits",
      "Enforce international compliance standards",
      "Document defects and drive corrective action",
    ],
  },
  {
    id: "03",
    title: "Logistics & Freight Coordinator",
    location: "Chennai / Dubai",
    Icon: Ship,
    features: [
      "Oversee end-to-end freight and forwarding",
      "Optimise sea, air and multimodal routing",
      "Handle customs clearance and documentation",
    ],
  },
  {
    id: "04",
    title: "B2B Account Manager",
    location: "London / Singapore",
    Icon: Handshake,
    features: [
      "Own client relationships from inquiry to delivery",
      "Turn quote requests into sourced orders",
      "Grow accounts across global markets",
    ],
  },
];

export function PrismaRoles() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });

  return (
    <section
      id="roles"
      className={cn(
        "relative min-h-screen flex flex-col justify-center bg-white py-14 lg:py-16 px-4 sm:px-6 md:px-8",
        almarai.className
      )}
      style={{
        "--primary": "222, 219, 200", // #DEDBC8
      } as React.CSSProperties}
    >
      {/* Subtle Noise Overlay */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.15] mix-blend-overlay pointer-events-none z-0"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="noiseFilterBg">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="4"
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#noiseFilterBg)" />
      </svg>

      <div className="relative z-10 max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="mb-8 lg:mb-10">
          <WordsPullUpMultiStyle
            segments={[
              { text: "Open roles across our global sourcing network. ", className: "text-black" },
              { text: "From China factory floors to freight lanes worldwide.", className: "text-gray-500" }
            ]}
            className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-normal max-w-2xl leading-tight"
          />
        </div>

        {/* 4-column grid of Affhan roles — white liquid-glass cards */}
        <div ref={containerRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6 lg:h-[440px]">
          {ROLES.map((role, idx) => (
            <motion.div
              key={role.id}
              className="liquid-glass-card flex flex-col justify-between p-6 lg:p-7 h-[400px] lg:h-full"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: idx * 0.15 }}
            >
              <div>
                <div className="flex justify-between items-start mb-8">
                  <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-[#176579]/10 ring-1 ring-[#176579]/15">
                    <role.Icon className="h-5 w-5 sm:h-6 sm:w-6 text-[#176579]" strokeWidth={1.5} />
                  </div>
                  <span className="text-slate-400 text-xs font-semibold">{role.id}</span>
                </div>
                <h3 className="text-slate-900 text-lg sm:text-xl mb-1 font-semibold tracking-tight">{role.title}</h3>
                <p className="text-slate-500 text-xs mb-6">{role.location}</p>

                <ul className="space-y-4">
                  {role.features.map((feature, fIdx) => (
                    <li key={fIdx} className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-[#27a8c4] shrink-0 mt-0.5" />
                      <span className="text-slate-600 text-xs sm:text-sm leading-snug">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <a href="/contact/" className="inline-flex items-center gap-2 group cursor-pointer w-max mt-8">
                <span className="text-[#176579] text-xs sm:text-sm font-semibold">Learn more</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#176579] transition-transform duration-300 group-hover:translate-x-1 -rotate-45" />
              </a>
            </motion.div>
          ))}

        </div>
      </div>
    </section>
  );
}
