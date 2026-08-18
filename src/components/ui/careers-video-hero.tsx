"use client";

import { Instrument_Serif } from "next/font/google";
import { cn } from "@/lib/utils";
import { scrollToId } from "@/lib/scroll";

const instrument = Instrument_Serif({ weight: "400", subsets: ["latin"] });

export function CareersVideoHero() {
  return (
    <section
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-32 pb-40 text-center"
      style={{
        "--background": "201 100% 13%",
        "--foreground": "0 0% 100%",
        "--muted-foreground": "240 4% 66%",
      } as React.CSSProperties}
    >

      {/* Background Video */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          poster="/career-video/career-1-poster.jpg"
          className="h-full w-full object-cover"
          src="/career-video/career-1.mp4"
        />
        {/* A subtle overlay to ensure text readability against the video */}
        <div className="absolute inset-0 bg-black/30 mix-blend-multiply" />
      </div>

      <style>{`
        @keyframes fade-rise {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-rise { animation: fade-rise 0.8s ease-out both; }
        .animate-fade-rise-delay { animation: fade-rise 0.8s ease-out 0.2s both; }
        .animate-fade-rise-delay-2 { animation: fade-rise 0.8s ease-out 0.4s both; }

        .liquid-glass {
          background: rgba(255, 255, 255, 0.01);
          background-blend-mode: luminosity;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
          border: none;
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1);
          position: relative;
          overflow: hidden;
          transition: transform 0.3s ease;
        }
        .liquid-glass:hover {
          transform: scale(1.03);
        }
        .liquid-glass::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1.4px;
          background: linear-gradient(180deg,
            rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.15) 20%,
            rgba(255,255,255,0) 40%, rgba(255,255,255,0) 60%,
            rgba(255,255,255,0.15) 80%, rgba(255,255,255,0.45) 100%);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          pointer-events: none;
        }
      `}</style>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center max-w-7xl mx-auto">
        <h1 className={cn(
          "animate-fade-rise text-5xl sm:text-7xl md:text-8xl leading-[0.95] tracking-[-2.46px] font-normal text-[hsl(var(--foreground))]",
          instrument.className
        )}>
          Grow <em className="not-italic text-[hsl(var(--muted-foreground))]">without limits</em>,{" "}
          with <em className="not-italic text-[hsl(var(--muted-foreground))]">Affhan</em>.
        </h1>

        <p className="animate-fade-rise-delay text-[hsl(var(--muted-foreground))] text-base sm:text-lg max-w-2xl mt-8 leading-relaxed font-[family-name:var(--font-geist-sans)]">
          From Chennai to Guangzhou, London to Dubai, Affhan sources, inspects and moves the world&apos;s goods across 190+ markets. Join the team that turns global trade into everyday craft &mdash; and build a career without borders.
        </p>

        <button
          onClick={() => scrollToId("roles")}
          className="animate-fade-rise-delay-2 liquid-glass rounded-full px-14 py-5 text-base text-[hsl(var(--foreground))] mt-12 cursor-pointer font-[family-name:var(--font-geist-sans)]"
        >
          Begin Journey
        </button>
      </div>
    </section>
  );
}
