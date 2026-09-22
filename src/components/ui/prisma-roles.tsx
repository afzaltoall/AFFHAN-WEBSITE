"use client";

import { useRef } from "react";
import { Check, ArrowRight, Package, ShieldCheck, Ship, Handshake } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Almarai } from "next/font/google";
import { cn } from "@/lib/utils";
import { ROLES, rolePath, roleLocationLabel } from "@/lib/careerRoles";
import { useScrollLit, staggerLit, ink, INK_LIT } from "./scrollLit";

// latin only — the page renders no Arabic text, and the arabic subset is a
// large glyph set that would be downloaded and never drawn.
//
// 400/700 only. Almarai has no 500 or 600 face, so the font-normal and
// font-semibold used in this section resolve to 400 and 700 anyway; declaring
// 300 and 800 as well just preloaded two files nothing ever renders.
const almarai = Almarai({ weight: ["400", "700"], subsets: ["latin"] });

// The roles themselves now live in src/lib/careerRoles.ts, because the careers
// layout has to read the same list to emit JobPosting markup and this file is
// a client component. Only the icon per role stays here — it is presentation,
// and a lucide component has no business in a data module the server imports.
/**
 * The heading, in two voices — the statement and the qualifier under it.
 *
 * Split into words here because the reveal darkens word by word, exactly as
 * PrismaHero's sentence does. The second line keeps its quieter target colour,
 * so the two-tone the design already had survives the change: both lines
 * darken, they just darken to different inks.
 */
const HEADING = [
  { text: "Open roles across our global sourcing network.", lit: INK_LIT },
  { text: "From China factory floors to freight lanes worldwide.", lit: "#6b7280" },
].map((seg) => ({ ...seg, words: seg.text.split(" ") }));

const HEADING_WORDS = HEADING.reduce((n, s) => n + s.words.length, 0);

const ROLE_ICONS: Record<string, LucideIcon> = {
  "01": Package,
  "02": ShieldCheck,
  "03": Ship,
  "04": Handshake,
};

export function PrismaRoles() {
  const sectionRef = useRef<HTMLElement>(null);

  /* One screen tall, so the track is the approach rather than the section's
     own length: progress starts as the top clears the fold and completes once
     the section is settled in view. PrismaHero uses start/end because it is a
     tall pinned track; the mechanism is the same, only the window differs. */
  const { p, reduced } = useScrollLit(sectionRef, ["start 0.9", "center 0.45"]);

  // Heading first, then the cards — the same order a reader's eye takes.
  const HEAD_FROM = 0.0;
  const HEAD_TO = 0.55;
  const CARDS_FROM = 0.42;
  /* 0.92, not 1: with the 1.6 overlap the last card starts at
     CARDS_FROM + 3*each and still needs each*1.6 to finish, so ending the
     stagger at 1 leaves card four at 0.75 when the section is fully in view.
     Measured: it now completes at p=0.995. */
  const CARDS_TO = 0.92;

  let wordCursor = -1;

  return (
    <section
      ref={sectionRef}
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
          <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-normal max-w-2xl leading-tight">
            {HEADING.map((seg, segIdx) => (
              <span key={segIdx} className={segIdx === 1 ? "block" : undefined}>
                {seg.words.map((word) => {
                  wordCursor += 1;
                  const lit = reduced
                    ? 1
                    : staggerLit(p, wordCursor, HEADING_WORDS, HEAD_FROM, HEAD_TO, 3);
                  return (
                    <span
                      key={wordCursor}
                      className="inline-block will-change-[color,transform]"
                      style={ink(lit, seg.lit)}
                    >
                      {word}
                      {"\u00A0"}
                    </span>
                  );
                })}
              </span>
            ))}
          </h2>
        </div>

        {/* 4-column grid of Affhan roles — white liquid-glass cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6 lg:h-[440px]">
          {ROLES.map((role, idx) => {
            /* Was: opacity+scale over 0.8s with a 0.15s delay per card, fired
               once by useInView. That is a clock, and next to a scroll-linked
               section it reads as a separate animation that happens to start
               nearby. This is the same stagger expressed in scroll progress,
               so the cards arrive with the wheel and reverse with it. */
            const lit = reduced ? 1 : staggerLit(p, idx, ROLES.length, CARDS_FROM, CARDS_TO);
            return (
            <div
              key={role.id}
              id={`role-${role.id}`}
              className="liquid-glass-card flex flex-col justify-between p-6 lg:p-7 h-[400px] lg:h-full will-change-[opacity,transform]"
              style={{
                opacity: 0.12 + lit * 0.88,
                transform: `translateY(${(1 - lit) * 18}px) scale(${0.965 + lit * 0.035})`,
              }}
            >
              <div>
                <div className="flex justify-between items-start mb-8">
                  <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-[#176579]/10 ring-1 ring-[#176579]/15">
                    {(() => {
                      const Icon = ROLE_ICONS[role.id] ?? Package;
                      return <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-[#176579]" strokeWidth={1.5} />;
                    })()}
                  </div>
                  <span className="text-slate-400 text-xs font-semibold">{role.id}</span>
                </div>
                <h3 className="text-slate-900 text-lg sm:text-xl mb-1 font-semibold tracking-tight">{role.title}</h3>
                <p className="text-slate-500 text-xs mb-6">{roleLocationLabel(role)}</p>

                <ul className="space-y-4">
                  {role.features.map((feature, fIdx) => (
                    <li key={fIdx} className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-[#27a8c4] shrink-0 mt-0.5" />
                      <span className="text-slate-600 text-xs sm:text-sm leading-snug">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <a href={rolePath(role)} className="inline-flex items-center gap-2 group cursor-pointer w-max mt-8">
                <span className="text-[#176579] text-xs sm:text-sm font-semibold">View role &amp; apply</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#176579] transition-transform duration-300 group-hover:translate-x-1 -rotate-45" />
              </a>
            </div>
            );
          })}

        </div>
      </div>
    </section>
  );
}
