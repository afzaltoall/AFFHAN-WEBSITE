"use client";

import { useEffect, useRef } from "react";
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
    <section ref={rootRef} className="relative bg-[#FAFAF7] md:h-[320vh]">
      <style>{`
        /* One list, two shapes.
           The milestones used to be written out twice — an absolutely
           positioned flow chart for desktop and a separate vertical timeline
           for mobile — which put every milestone into the HTML twice over.
           Crawlers saw the whole story duplicated and the maintenance cost was
           two copies of the same words. Now the list renders once and the
           desktop coordinates ride in on custom properties. */
        @media (min-width: 768px) {
          .gf-list { position: relative; height: 48vh; }
          .gf-node {
            position: absolute;
            left: var(--gf-x);
            top: var(--gf-y);
            width: 10rem;
            margin: 0;
            transform: translate(-50%, -50%);
            text-align: center;
          }
          .gf-node .gf-dot-wrap { justify-content: center; }
          .gf-rail { display: none; }
        }
      `}</style>

      <div className="overflow-hidden px-6 py-20 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:justify-center md:py-0">
        {/* One cool wash off the brand teal. The dark build carried a glow and
            a grid overlay; on white a grid reads as graph paper. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 55% at 50% 48%, rgba(23,101,121,0.07) 0%, rgba(23,101,121,0.02) 45%, rgba(250,250,247,0) 76%)",
          }}
        />

        <div className="relative z-10 mx-auto w-full max-w-6xl">
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#176579]">
              Global Reach · Our Growth
            </span>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-[#08222e] sm:text-4xl md:text-5xl">
              From one desk to 190+ markets.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-[#5a6e77] sm:text-base">
              Two decades of steady expansion &mdash; every office a new lane opened, every
              hire a new capability. Scroll the story of the network you&apos;d be joining.
            </p>
          </div>

          {/* The connecting wire. Decorative: the same sequence is in the list
              below it, in order, so nothing here carries meaning on its own. */}
          <svg
            className="pointer-events-none absolute inset-x-0 bottom-0 top-[38%] hidden h-[48vh] w-full overflow-visible md:block"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="growthWire" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="#176579" />
                <stop offset="100%" stopColor="#1d8ba6" />
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
              />
            ))}
          </svg>

          {/* The milestones, once, in order. */}
          <ol className="gf-list relative mt-12 pl-8 md:mt-10 md:pl-0">
            {/* Mobile rail. Hidden at md, where the SVG wire takes over. */}
            <span
              aria-hidden="true"
              className="gf-rail absolute bottom-1 left-[11px] top-1 w-px bg-[#176579]/25"
            />
            {STEPS.map((s, i) => (
              <li
                key={s.tag}
                className="gf-node relative mb-8 last:mb-0 md:mb-0"
                style={{ "--gf-x": `${POS[i].x}%`, "--gf-y": `${POS[i].y}%` } as React.CSSProperties}
              >
                <span className="gf-dot-wrap mb-0 flex md:mb-2">
                  <span
                    aria-hidden="true"
                    className="absolute -left-[26px] top-1 h-3 w-3 rounded-full bg-[#176579] ring-4 ring-[#176579]/15 md:static md:h-4 md:w-4"
                  />
                </span>
                <div className="md:rounded-xl md:border md:border-[#08222e]/10 md:bg-white md:px-3 md:py-2 md:shadow-[0_1px_2px_rgba(8,34,46,0.04)]">
                  {/* A year is a date; the rest are place names. */}
                  {/^\d{4}$/.test(s.tag) ? (
                    <time dateTime={s.tag} className="block text-[11px] font-bold uppercase tracking-wider text-[#176579]">
                      {s.tag}
                    </time>
                  ) : (
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-[#176579]">{s.tag}</span>
                  )}
                  <h3 className="mt-0.5 text-sm font-semibold leading-tight text-[#08222e]">{s.title}</h3>
                  <p className="mt-0.5 text-xs leading-snug text-[#5a6e77]">{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

export default GrowthFlow;
