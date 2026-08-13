"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Instrument_Serif } from "next/font/google";
import { cn } from "@/lib/utils";

const instrument = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin"] });

export function AsmeSections() {
  return (
    <div className="bg-white text-slate-900 selection:bg-slate-200 w-full overflow-hidden">
      <Section1Hero />
      <Section4Philosophy />
    </div>
  );
}

// ==========================================
// SECTION 1: HERO
// ==========================================
function Section1Hero() {
  return (
    <section className="relative flex flex-col h-screen min-h-[640px] overflow-hidden bg-white">
      {/* Background Video */}
      <div className="absolute inset-0 z-0">
        <video
          src="/career-video/career-3.mp4"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="w-full h-full object-cover object-bottom"
        />
        {/* Subtle dark gradient to help text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80 mix-blend-multiply" />
      </div>

      {/* Hero Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-6 text-center">
        <h1 className={cn("text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-white tracking-tight whitespace-nowrap mb-4 sm:mb-6", instrument.className)}>
          Never miss a <em className="italic font-light">role</em>.
        </h1>

        <p className="text-white/80 text-sm sm:text-base leading-relaxed max-w-lg mb-6 sm:mb-8 px-4">
          Get Affhan&apos;s newest openings and team stories delivered to your inbox. No spam &mdash; just opportunities to build a career without borders.
        </p>

        <form className="liquid-glass rounded-full max-w-xl w-full pl-6 pr-2 py-2 flex items-center gap-3 border border-white/10 mx-auto" onSubmit={(e) => e.preventDefault()}>
          <input
            type="email"
            placeholder="Enter your email for job alerts"
            className="flex-1 bg-transparent text-white placeholder:text-white/40 focus:outline-none text-sm sm:text-base min-w-0"
            required
          />
          <button type="submit" aria-label="Subscribe to job alerts" className="bg-white rounded-full p-3 text-black hover:scale-105 transition-transform shrink-0">
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>

        <a href="/about" className="mt-6 sm:mt-8 liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium border border-white/10 hover:bg-white/10 transition-colors">
          Life at Affhan
        </a>
      </div>

      {/* Social Icons Footer — Affhan's official channels */}
      <div className="relative z-10 flex flex-wrap justify-center gap-3 sm:gap-4 pb-6 sm:pb-8 mt-auto shrink-0">
        {SOCIALS.map(({ label, href, Icon }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            className="liquid-glass rounded-full p-3.5 border border-white/10 text-white/80 hover:text-white hover:bg-white/10 transition-all"
          >
            <Icon className="w-5 h-5" />
          </a>
        ))}
      </div>
    </section>
  );
}

// Custom Icons to prevent lucide-react version issues
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
    </svg>
  );
}

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"/>
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z"/>
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M16.5 3c.3 2.1 1.6 3.6 3.5 3.9v2.5c-1.3.1-2.5-.3-3.6-1v5.9c0 3.4-2.6 5.7-5.7 5.7A5.6 5.6 0 0 1 5 14.4c0-3.3 3-5.9 6.4-5.3v2.7c-.4-.1-.8-.2-1.2-.2-1.5 0-2.7 1.2-2.7 2.7s1.2 2.7 2.7 2.7c1.6 0 2.8-1.2 2.8-2.9V3h2.5z"/>
    </svg>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-.95 1.83-1.95 3.77-1.95C20.4 8.75 21 11 21 14.1V21h-4v-6.1c0-1.45-.03-3.3-2-3.3s-2.32 1.57-2.32 3.2V21H9z"/>
    </svg>
  );
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M23 12s0-3.3-.42-4.88a2.52 2.52 0 0 0-1.77-1.78C19.24 5 12 5 12 5s-7.24 0-8.81.34a2.52 2.52 0 0 0-1.77 1.78C1 8.7 1 12 1 12s0 3.3.42 4.88c.23.87.9 1.55 1.77 1.78C4.76 19 12 19 12 19s7.24 0 8.81-.34a2.52 2.52 0 0 0 1.77-1.78C23 15.3 23 12 23 12zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/>
    </svg>
  );
}

// Affhan's official social channels (order: IG, FB, X, TikTok, LinkedIn, YouTube)
const SOCIALS: { label: string; href: string; Icon: (p: { className?: string }) => React.ReactElement }[] = [
  { label: "Instagram", href: "https://www.instagram.com/affhanglobal?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==", Icon: InstagramIcon },
  { label: "Facebook", href: "https://www.facebook.com/affhaninternational/reels/", Icon: FacebookIcon },
  { label: "Twitter", href: "https://x.com/affhan_shipping", Icon: TwitterIcon },
  { label: "TikTok", href: "https://www.tiktok.com/@affhan_global", Icon: TikTokIcon },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/affhanglobal/posts/", Icon: LinkedInIcon },
  { label: "YouTube", href: "https://www.youtube.com/@affhan_global/shorts", Icon: YouTubeIcon },
];

// ==========================================
// SECTION 4: PHILOSOPHY
// ==========================================
function Section4Philosophy() {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section 
      ref={ref}
      className="relative bg-white py-28 md:py-40 px-6 overflow-hidden"
    >
      <div className="max-w-6xl mx-auto">
        <motion.h2 
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl text-slate-900 tracking-tight mb-16 md:mb-24 text-center sm:text-left"
        >
          <span className={cn("italic font-light text-slate-400", instrument.className)}>Careers</span> x Affhan
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
          {/* Left: Video */}
          <motion.div 
            initial={{ opacity: 0, x: -40 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="rounded-3xl overflow-hidden aspect-[4/3] bg-slate-100 relative"
          >
            <video
              src="/career-video/career-4.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/5 mix-blend-multiply pointer-events-none" />
          </motion.div>
          
          {/* Right: Text Content */}
          <motion.div 
            initial={{ opacity: 0, x: 40 }}
            animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 40 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
            className="flex flex-col gap-6 sm:gap-8 px-4 sm:px-0"
          >
            <p className="text-slate-700 text-lg sm:text-xl md:text-2xl leading-relaxed font-light">
              No two days are the same. A morning call with a Guangzhou factory, an afternoon untangling a customs hold for a London client &mdash; hands-on, high-trust work where your decisions actually ship.
            </p>
            <p className="text-slate-500 text-sm sm:text-base leading-relaxed">
              Our offices span Chennai, Guangzhou, London, Singapore, Malaysia and Dubai &mdash; a close-knit crew where your work is seen and your ideas travel fast. Curious, driven and dependable? You&apos;ll fit right in.
            </p>
            <div className="mt-4">
              <a href="/contact" className="inline-block text-slate-900 text-sm font-medium uppercase tracking-widest border-b border-slate-300 pb-1 hover:border-slate-900 transition-colors">
                Join Our Team
              </a>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
