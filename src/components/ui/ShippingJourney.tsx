"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { JOURNEY_STAGES, LANES } from "@/lib/shippingJourney";

/**
 * The five stages of a shipment, scrubbed to scroll position.
 *
 * This is the one place on this page that earns ScrollTrigger. The test is the
 * one already written down in Reveal.tsx: ScrollTrigger earns its weight "when
 * something is pinned or scrubbed to scroll position", and a class toggle does
 * not. The cards on this page are still IntersectionObserver reveals; the route
 * line here is genuinely scrubbed — its draw position IS the scroll position,
 * and it runs backwards when you scroll back up. GSAP is already in this
 * route's bundle because ShippingHero uses it, so the marginal cost is nil.
 *
 * Sticky, not ScrollTrigger's `pin`. `pin` wraps and re-parents the DOM to hold
 * an element still; CSS sticky does the same without touching the tree, and it
 * is what ShippingHero, growth-flow and parallax-scrolling all already chose.
 *
 * No Lenis. ShippingHero's comment says why: the parallax components each
 * construct their own instance for their own page, there is no site-wide smooth
 * scroll to join, and a second virtual scroller on one document is a bug.
 *
 * The whole animation is progressive enhancement. The markup below renders
 * every stage, readable and in order, with no JavaScript at all — the route
 * line is decoration over content that already stands up. Anyone who asked for
 * less motion, and every phone, gets exactly that.
 */
export function ShippingJourney() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const root = rootRef.current;
    if (!root) return;

    const mm = gsap.matchMedia();

    mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
      const path = root.querySelector<SVGPathElement>("[data-route]");
      const dot = root.querySelector<SVGCircleElement>("[data-dot]");
      const steps = gsap.utils.toArray<HTMLElement>("[data-stage]", root);
      if (!path) return;

      const length = path.getTotalLength();
      gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });

      // The line draws in step with the scroll, and undraws on the way back.
      const draw = gsap.to(path, {
        strokeDashoffset: 0,
        ease: "none",
        scrollTrigger: {
          trigger: root,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.4,
          onUpdate: (self) => {
            if (!dot) return;
            // Ride the dot along the same path the stroke is revealing, so the
            // marker and the drawn line cannot disagree.
            const p = path.getPointAtLength(self.progress * length);
            gsap.set(dot, { attr: { cx: p.x, cy: p.y } });
          },
        },
      });

      // Each stage lights up as its share of the scroll arrives. Not a fade in
      // from nothing — every stage is legible throughout, this only marks
      // which one the line has reached.
      const stageTriggers = steps.map((el, i) =>
        ScrollTrigger.create({
          trigger: root,
          start: () => `top+=${(i / steps.length) * 100}% top`,
          end: () => `top+=${((i + 1) / steps.length) * 100}% top`,
          onToggle: ({ isActive }) => {
            el.dataset.active = isActive ? "true" : "false";
          },
        })
      );

      return () => {
        draw.scrollTrigger?.kill();
        draw.kill();
        stageTriggers.forEach((t) => t.kill());
        gsap.set(path, { clearProps: "strokeDasharray,strokeDashoffset" });
      };
    });

    return () => mm.revert();
  }, []);

  return (
    <section
      ref={rootRef}
      aria-labelledby="journey-heading"
      className="relative bg-slate-950 text-white"
    >
      {/* 5 stages x 60vh of scrub on desktop; on smaller screens this collapses
          to its natural height and simply reads as a list. */}
      <div className="lg:h-[340vh]">
        <div className="lg:sticky lg:top-0 lg:flex lg:h-screen lg:items-center">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 lg:py-0">
            <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-brand">
              The journey
            </span>
            <h2
              id="journey-heading"
              className="mt-3 max-w-2xl text-3xl font-black tracking-tight text-balance sm:text-4xl lg:text-5xl"
            >
              Five stages, one company answering for all of them
            </h2>

            {/* The route. Decorative: every stage below is readable without it. */}
            <svg
              aria-hidden="true"
              viewBox="0 0 1200 120"
              preserveAspectRatio="none"
              className="mt-8 hidden h-[72px] w-full lg:block"
            >
              <path
                d="M20,90 C220,90 240,30 420,30 C600,30 620,96 800,96 C960,96 1000,36 1180,36"
                fill="none"
                stroke="rgba(255,255,255,0.14)"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                data-route
                d="M20,90 C220,90 240,30 420,30 C600,30 620,96 800,96 C960,96 1000,36 1180,36"
                fill="none"
                stroke="#27a8c4"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle data-dot cx="20" cy="90" r="7" fill="#27a8c4">
                <animate attributeName="r" values="7;9;7" dur="2.4s" repeatCount="indefinite" />
              </circle>
            </svg>

            <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:mt-8 lg:grid-cols-5 lg:gap-4">
              {JOURNEY_STAGES.map((stage) => (
                <li
                  key={stage.id}
                  data-stage
                  data-active="false"
                  className="group rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors duration-500 lg:min-h-[19rem] data-[active=true]:border-brand/60 data-[active=true]:bg-brand/10"
                >
                  <span className="text-[11px] font-bold tracking-[0.2em] text-brand">
                    {stage.id}
                  </span>
                  <h3 className="mt-2 text-base font-bold tracking-tight text-white">
                    {stage.title}
                  </h3>
                  <p className="mt-2 text-[13px] font-medium leading-relaxed text-white/70">
                    {stage.lead}
                  </p>
                  {/* Below lg every stage reads in full — it is a plain list
                      and nothing is sticky. From lg up the stage is pinned to
                      the viewport, and five full bodies are taller than the
                      screen, so the body belongs to whichever stage the line
                      has reached. One at a time keeps the row inside the
                      fold; the text stays in the DOM either way. */}
                  <p className="mt-3 text-[13px] leading-relaxed text-white/50 lg:hidden lg:group-data-[active=true]:block">
                    {stage.body}
                  </p>
                </li>
              ))}
            </ol>

            {/* The three lanes with an Affhan office at both ends. Real
                sailing times — see the note in lib/shippingJourney.ts. */}
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-white/10 pt-6">
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">
                Typical sailing time
              </span>
              {LANES.map((lane) => (
                <span key={lane.port} className="text-[13px] text-white/70">
                  {lane.from} → {lane.to}{" "}
                  <strong className="font-bold text-white">~{lane.days} days</strong>
                  <span className="text-white/35"> ({lane.port})</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
