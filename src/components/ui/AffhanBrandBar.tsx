"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

/**
 * Affhan.com Brand Lockup (Alibaba.com style, pure clean branding - NO badge/pill box)
 * Symmetrically balanced in the hero section with pixel-perfect alignment.
 */
export function AffhanBrandBar() {
  return (
    <div className="absolute left-2 lg:left-6 xl:left-10 top-1/2 hidden -translate-y-1/2 lg:block z-20">
      <Link
        href="/"
        className="group flex items-center gap-3 select-none transition-transform duration-200 hover:scale-[1.02]"
      >
        {/* 3D Affhan Orbital Emblem - Clean & Proudly Sized without badge container */}
        <motion.div
          aria-hidden="true"
          className="relative flex shrink-0 items-center justify-center"
          animate={{ y: [0, -2, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <Image
            src="/affhan-emblem.png"
            alt="Affhan Logo"
            width={100}
            height={100}
            priority
            className="h-11 w-auto object-contain drop-shadow-[0_2px_8px_rgba(23,101,121,0.22)] transition-transform duration-300 group-hover:scale-105"
          />
        </motion.div>

        {/* Vertically Stacked Text Lockup - Perfect Optical Alignment */}
        <div className="flex flex-col justify-center text-left">
          {/* Main Brand Name: Affhan.com */}
          <div className="flex items-baseline leading-none">
            <span className="text-[25px] font-black tracking-[-0.03em] text-slate-900 transition-colors duration-200 group-hover:text-brand-dark">
              Affhan
            </span>
            <span className="text-[25px] font-black tracking-[-0.03em] text-brand ml-[1px]">
              .com
            </span>
          </div>

          {/* Sub-tagline: Welcome to Affhan Website (Clean Typography, No badge, No emojis) */}
          <span className="mt-1 text-[12px] font-bold tracking-tight text-slate-500 transition-colors duration-200 group-hover:text-slate-800">
            Welcome to <span className="font-extrabold text-brand-dark">Affhan Website</span>
          </span>
        </div>
      </Link>
    </div>
  );
}
