"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * The shipping hero: the sail mark rises out of the fold as you scroll into it,
 * and the title settles in behind it.
 *
 * Pinned the way the rest of the site pins — a tall section with a sticky
 * stage inside it, scrubbed from "top top" to "bottom bottom", exactly as
 * parallax-scrolling.tsx and growth-flow.tsx do. ScrollTrigger's own `pin`
 * wraps and re-parents the DOM to hold an element still; CSS sticky already
 * does that without touching the tree, and it is what the existing components
 * chose.
 *
 * The section is 160vh, so the scrub plays over 60vh of scrolling. Long enough
 * to read as motion, short enough that nobody is held at the top of a services
 * page they came to read.
 *
 * No Lenis. The parallax components each construct their own instance for
 * their own page; there is no site-wide smooth scroll to join, and adding a
 * second instance here would put two virtual scrollers on one document.
 */
export function ShippingHero({ officeCount }: { officeCount: number }) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const root = rootRef.current;
    if (!root) return;

    const mm = gsap.matchMedia();

    // Desktop: scrubbed. The ship's position is the scroll position — it moves
    // only while the reader moves, and reverses if they scroll back up.
    mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
      const ship = root.querySelector<HTMLElement>("[data-ship]");
      const title = root.querySelectorAll<HTMLElement>("[data-hero-reveal]");
      if (!ship) return;

      // Below the fold to begin with, so it enters rather than appears.
      gsap.set(ship, { yPercent: 165, opacity: 0 });
      gsap.set(title, { opacity: 0, y: 16 });

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: root,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.6,
        },
      });

      tl.to(ship, { yPercent: 0, opacity: 1, duration: 1 }, 0);
      // "Affhan Shipping" lands slightly behind the ship, so the arrival leads
      // and the words follow — the same fade-up the milestone nodes use in
      // growth-flow.
      title.forEach((el, i) => {
        tl.to(el, { opacity: 1, y: 0, duration: 0.4 }, 0.45 + i * 0.12);
      });

      return () => {
        tl.kill();
      };
    });

    // Mobile, and anyone who asked for less motion: a plain fade-in, played
    // once on entry. Touch scrolling carries momentum, so a scrubbed transform
    // stutters as the finger lifts — the effect is not worth the jank.
    mm.add("(max-width: 767px), (prefers-reduced-motion: reduce)", () => {
      const targets = root.querySelectorAll<HTMLElement>("[data-ship], [data-hero-reveal]");
      const tween = gsap.fromTo(
        targets,
        { opacity: 0, y: 14 },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          stagger: 0.08,
          ease: "power2.out",
          scrollTrigger: { trigger: root, start: "top 80%", once: true },
        }
      );
      return () => {
        tween.scrollTrigger?.kill();
        tween.kill();
      };
    });

    // The ship is a raster that loads after first paint; measuring the scrub
    // range before it lands leaves the range stale.
    const refresh = setTimeout(() => ScrollTrigger.refresh(), 400);

    return () => {
      clearTimeout(refresh);
      // revert() runs every matchMedia cleanup above and restores the inline
      // styles gsap.set wrote, so nothing is left behind on unmount.
      mm.revert();
    };
  }, []);

  return (
    <div ref={rootRef} className="relative h-[160vh]">
      <section className="sticky top-0 flex h-screen items-center overflow-hidden bg-gradient-to-br from-brand to-brand-dark text-white">
        {/* min-w-0 on the flex item and on the text column. Defensive rather
            than fixing an observed break: this div is a flex item of the
            section and a grid container in its own right, both of which
            default to min-width:auto, and the section clips overflow — so a
            heading long enough to hold them open would be cut off with no
            scrollbar to reveal it. */}
        <div className="mx-auto grid w-full min-w-0 max-w-6xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-[1fr_auto] lg:gap-16">
          <div className="min-w-0">
            <p
              data-hero-reveal
              className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/70"
            >
              Affhan Shipping
            </p>
            {/* The h1, the paragraph and the buttons are NOT animated. The
                trigger starts at the top of the page, so at scroll 0 the
                timeline is at progress 0 — anything revealed by it would be
                invisible on arrival. That is fine for a mark rising into view;
                it is not fine for the page's heading, which is the LCP element
                and the reason someone opened the page. */}
            <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-[1.12] tracking-tight sm:text-4xl lg:text-5xl">
              Freight forwarding and NVOCC services, from the factory floor to
              your warehouse
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/85 sm:text-lg">
              Sea and air freight, customs clearance and inland delivery, run out of
              our own offices in {officeCount} countries. The same team that sources
              your goods can move them.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/contact/"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-brand-dark shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
              >
                Request a shipping quote <ArrowRight size={16} />
              </Link>
              <Link
                href="/about/"
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                About Affhan
              </Link>
            </div>
          </div>

          {/* Held to 220px. The source is 450×360, so this stays inside a 2x
              display's budget; drawn larger it visibly softens. */}
          <div data-ship className="hidden justify-self-center lg:block">
            <Image
              src="/affhan-ship.png"
              alt=""
              aria-hidden="true"
              width={450}
              height={360}
              priority
              className="h-auto w-[220px] object-contain drop-shadow-2xl"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
