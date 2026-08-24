"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

// Affhan's expansion story — each node a new office / capability, rising to
// express growth. The desktop view is a scroll-scrubbed "wired" flow chart:
// as you scroll the pinned stage, SVG connectors draw in and milestone nodes
// pop up one after another, tied directly to scroll position (parallax feel).
const STEPS = [
  { tag: "2000", title: "Founded in Chennai", desc: "One office, one promise." },
  { tag: "Guangzhou", title: "On-the-ground sourcing", desc: "Closer to the factories." },
  { tag: "London", title: "European gateway", desc: "Serving Western clients." },
  { tag: "Singapore", title: "APAC trade desk", desc: "Regional momentum." },
  { tag: "Dubai", title: "Middle-East hub", desc: "Bridging East and West." },
  // Seven, matching the office records in OfficeLocations and the count on the
  // About page. This read "6 offices" while those said 7 and 8 respectively.
  { tag: "Today", title: "190+ markets", desc: "7 offices. One team." },
];

// Node anchor points as percentages of the flow area (rising left → right).
const POS = [
  { x: 11, y: 82 },
  { x: 27, y: 67 },
  { x: 43, y: 57 },
  { x: 58, y: 45 },
  { x: 74, y: 34 },
  { x: 89, y: 20 },
];

// Smooth horizontal-tangent cubic between two points (in the 0–100 SVG space).
function segPath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const cx0 = a.x + (b.x - a.x) * 0.5;
  const cx1 = b.x - (b.x - a.x) * 0.5;
  return `M ${a.x} ${a.y} C ${cx0} ${a.y}, ${cx1} ${b.y}, ${b.x} ${b.y}`;
}

export function GrowthFlow() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    // Lenis lives here now (moved from the old mountain parallax): smooth
    // scroll site-wide on this page + exposes the instance so the in-page
    // anchor buttons can scroll through it. See src/lib/scroll.ts.
    const lenis = new Lenis();
    (window as unknown as { lenis?: Lenis }).lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Scroll-scrubbed reveal — desktop only (mobile uses a plain timeline).
    const mm = gsap.matchMedia();
    mm.add("(min-width: 768px)", () => {
      const root = rootRef.current;
      if (!root) return;

      const paths = gsap.utils.toArray<SVGPathElement>(".gf-wire");
      paths.forEach((p) => {
        const len = p.getTotalLength();
        gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
      });
      const nodes = gsap.utils.toArray<HTMLElement>(".gf-node");
      gsap.set(nodes, { opacity: 0, scale: 0.6, y: 16 });

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: root,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.6,
        },
      });

      // First node, then draw wire → reveal next node, repeating.
      tl.to(nodes[0], { opacity: 1, scale: 1, y: 0, duration: 0.5 }, 0);
      paths.forEach((p, i) => {
        tl.to(p, { strokeDashoffset: 0, duration: 1 }, 0.5 + i * 1);
        tl.to(nodes[i + 1], { opacity: 1, scale: 1, y: 0, duration: 0.5 }, 0.5 + i * 1 + 0.6);
      });
    });

    const refresh = setTimeout(() => ScrollTrigger.refresh(), 400);
    return () => {
      clearTimeout(refresh);
      mm.revert();
      gsap.ticker.remove(tick);
      delete (window as unknown as { lenis?: Lenis }).lenis;
      lenis.destroy();
    };
  }, []);

  return (
    // Tall on desktop to give the scrub room; the inner stage is sticky/pinned.
    <section ref={rootRef} className="relative bg-[#070b12] md:h-[320vh]">
      <div className="md:sticky md:top-0 flex md:h-screen flex-col justify-center overflow-hidden py-20 md:py-0 px-6">
        {/* ambient brand glow + faint grid */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(39,168,196,0.12)_0%,_transparent_65%)]" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-6xl">
          {/* Header */}
          <div className="text-center">
            <span className="text-[#27a8c4] text-xs font-bold uppercase tracking-[0.25em]">
              Global Reach · Our Growth
            </span>
            <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
              From one desk to 190+ markets.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-white/60 text-sm sm:text-base leading-relaxed">
              Two decades of steady expansion &mdash; every office a new lane opened, every
              hire a new capability. Scroll the story of the network you&apos;d be joining.
            </p>
          </div>

          {/* Desktop: scroll-scrubbed wired flow chart */}
          <div className="relative mt-10 hidden md:block h-[48vh]">
            <svg
              className="absolute inset-0 h-full w-full overflow-visible"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="growthWire" x1="0" y1="1" x2="1" y2="0">
                  <stop offset="0%" stopColor="#176579" />
                  <stop offset="100%" stopColor="#27a8c4" />
                </linearGradient>
              </defs>
              {POS.slice(0, -1).map((p, i) => (
                <path
                  key={i}
                  className="gf-wire"
                  d={segPath(p, POS[i + 1])}
                  fill="none"
                  stroke="url(#growthWire)"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  style={{ filter: "drop-shadow(0 0 5px rgba(39,168,196,0.55))" }}
                />
              ))}
            </svg>

            {STEPS.map((s, i) => (
              <div
                key={s.tag}
                className="gf-node absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center w-40"
                style={{ left: `${POS[i].x}%`, top: `${POS[i].y}%` }}
              >
                <span className="relative mb-2 flex h-4 w-4">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#27a8c4] opacity-50 animate-ping" />
                  <span className="relative inline-flex h-4 w-4 rounded-full bg-[#27a8c4] ring-4 ring-[#27a8c4]/20" />
                </span>
                <div className="rounded-xl bg-white/[0.04] px-3 py-2 ring-1 ring-white/10 backdrop-blur-sm">
                  <span className="block text-[#27a8c4] text-[11px] font-bold uppercase tracking-wider">{s.tag}</span>
                  <span className="mt-0.5 block text-white text-sm font-semibold leading-tight">{s.title}</span>
                  <span className="mt-0.5 block text-white/50 text-xs leading-snug">{s.desc}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile: vertical timeline */}
          <div className="md:hidden relative mt-12 pl-8">
            <div className="absolute left-[11px] top-1 bottom-1 w-px bg-gradient-to-b from-[#176579] via-[#27a8c4] to-[#176579]" />
            {STEPS.map((s, i) => (
              <motion.div
                key={s.tag}
                className="relative mb-8 last:mb-0"
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full bg-[#27a8c4] ring-4 ring-[#27a8c4]/20" />
                <span className="text-[#27a8c4] text-xs font-bold uppercase tracking-wider">{s.tag}</span>
                <p className="text-white text-sm font-semibold leading-tight">{s.title}</p>
                <p className="text-white/50 text-xs">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default GrowthFlow;
