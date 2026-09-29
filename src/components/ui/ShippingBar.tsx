"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SHIP_MARK_HERO, SHIP_MARK_NAV } from "@/lib/shipMarkAssets";

/**
 * The way through to the shipping side. Two forms, one set of water:
 *
 * "pill" (from xl): at the left of the hero's badge line, in the place the
 * Affhan.com lockup had until the owner removed it (2026-09-25), absolutely
 * positioned so the badge beside it stays centred on the line and nothing
 * else in the hero moves. If the lockup comes back, this goes back to the
 * right end of the line: `right-12` in place of `left-10` below.
 *
 * "card" (below xl): one of the hero's two promo cards, beside the China trip
 * banner (MarketplaceHeroSection). There is no room for the pill beside the
 * badge below xl, and stacked above it, as it briefly was on 2026-09-29, it
 * crowded the badge and half covered it at 933px.
 *
 * It used to be a bare sail in the navbar's link row — decorative, unlabelled,
 * and impossible to guess at. Out here it carries its own name, which is what
 * makes it a destination rather than an ornament.
 */

interface Splash {
  id: number;
  x: number;
  y: number;
  drops: Array<{ dx: number; dy: number; size: number; delay: number }>;
}

const DROPS_PER_SPLASH = 9;
// Long enough for the slowest droplet plus its delay to land.
const SPLASH_LIFE_MS = 900;

function makeDrops() {
  return Array.from({ length: DROPS_PER_SPLASH }, () => {
    // Biased upward and outward: water thrown from an impact goes up and to the
    // sides, not down into the surface it just hit.
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;
    const power = 16 + Math.random() * 26;
    return {
      dx: Math.cos(angle) * power,
      dy: Math.sin(angle) * power,
      size: 3 + Math.random() * 4,
      delay: Math.random() * 70,
    };
  });
}

export function ShippingBar({ variant = "pill" }: { variant?: "pill" | "card" }) {
  const ref = useRef<HTMLAnchorElement | null>(null);
  const [splashes, setSplashes] = useState<Splash[]>([]);
  const nextId = useRef(0);
  // Impacts are throttled: without this, a fast sweep across the pill spawns a
  // splash per mousemove and the whole thing turns into foam.
  const lastAt = useRef(0);

  const splashAt = useCallback((clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const now = performance.now();
    if (now - lastAt.current < 160) return;
    lastAt.current = now;

    const rect = el.getBoundingClientRect();
    const id = nextId.current++;
    setSplashes((s) => [
      ...s,
      { id, x: clientX - rect.left, y: clientY - rect.top, drops: makeDrops() },
    ]);
    // The elements are removed once their animation is over; leaving them would
    // pile up invisible nodes for the life of the page.
    setTimeout(() => setSplashes((s) => s.filter((sp) => sp.id !== id)), SPLASH_LIFE_MS);
  }, []);

  // The splash layer. Clipped to the link and inert, so it can never take a
  // click meant for the link underneath it.
  const splash = (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {splashes.map((sp) => (
        <span key={sp.id}>
          <span
            className="splash-ring"
            style={{ left: sp.x, top: sp.y, width: 52, height: 52 }}
          />
          {sp.drops.map((d, i) => (
            <span
              key={i}
              className="splash-drop"
              style={
                {
                  left: sp.x,
                  top: sp.y,
                  width: d.size,
                  height: d.size,
                  animationDelay: `${d.delay}ms`,
                  "--dx": `${d.dx}px`,
                  "--dy": `${d.dy}px`,
                } as React.CSSProperties
              }
            />
          ))}
        </span>
      ))}
    </span>
  );

  // Sea along the bottom. Three layers at different speeds and opacities — a
  // single wave reads as a decal, while layers drifting past each other read
  // as water, because that parallax is what depth looks like on a real surface.
  const sea = (height: string) => (
    <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden ${height}`}>
      <span className="ship-wave ship-wave--back" />
      <span className="ship-wave ship-wave--mid" />
      <span className="ship-wave ship-wave--front" />
    </span>
  );

  const hover = {
    onMouseEnter: (e: React.MouseEvent) => splashAt(e.clientX, e.clientY),
    onMouseMove: (e: React.MouseEvent) => splashAt(e.clientX, e.clientY),
  };

  if (variant === "card") {
    return (
      // The same frame as the China trip card beside it (FireworksCard): white,
      // rounded-2xl, a brand ring, and the same lift on hover, so the two read
      // as a pair. The text sits clear of the water, which runs along the foot.
      <Link
        ref={ref}
        href="/shipping/"
        {...hover}
        className="group relative flex h-full items-center gap-4 overflow-hidden rounded-2xl bg-white/85 px-4 pb-8 pt-5 shadow-md ring-1 ring-brand/20 backdrop-blur-sm transition-[translate,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-xl hover:ring-brand/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#176579] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:gap-5 sm:px-6 md:pb-9"
      >
        {splash}
        {sea("h-7 md:h-9")}
        <span aria-hidden="true" className="relative flex shrink-0 items-center animate-float-medium">
          <Image {...SHIP_MARK_HERO} alt="" sizes="64px" className="block h-12 w-auto object-contain sm:h-14 md:h-16" />
        </span>
        <span className="relative flex min-w-0 flex-1 flex-col">
          <span className="block bg-gradient-to-r from-brand-dark to-brand bg-clip-text text-[14px] font-extrabold uppercase leading-none tracking-[0.18em] text-transparent sm:text-[16px]">
            AFFHAN Shipping
          </span>
          {/* The shipping page's own summary of what it offers, not new copy. */}
          <span className="mt-2 text-[13px] leading-snug text-slate-600 sm:text-sm">
            Sea and air freight, customs clearance and door-to-door delivery.
          </span>
        </span>
        <span
          aria-hidden="true"
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-dark text-white shadow-sm transition-transform duration-300 group-hover:translate-x-0.5"
        >
          <ArrowRight size={16} />
        </span>
      </Link>
    );
  }

  return (
    // left-10 is the lockup's own inset, so the pill sits exactly where it
    // did. From xl only: below that it is the card, in the promo row.
    <div className="absolute left-10 top-1/2 hidden -translate-y-1/2 xl:block">
      <Link
        ref={ref}
        href="/shipping/"
        {...hover}
        className="group relative flex items-center gap-3 overflow-hidden rounded-full border border-brand/30 bg-white/75 py-2 pl-2.5 pr-5 shadow-md backdrop-blur-sm transition-all hover:border-brand/60 hover:bg-white hover:shadow-lg"
      >
        {splash}
        {sea("h-5")}

        <span
          aria-hidden="true"
          className="relative flex shrink-0 items-center animate-float-medium"
        >
          <Image
            {...SHIP_MARK_NAV}
            alt=""
            sizes="40px"
            /* Nudged down 4px so the mark sits into the pill's water instead of
               floating above it — asked for with the container-ship mark, and
               kept for the emblem. On the Image rather than the span, because
               the span carries animate-float-medium and owns its own transform. */
            className="block h-10 w-auto translate-y-[4px] object-contain"
          />
        </span>

        {/* The name on its own. A one-line label sits on the pill's optical
            centre, which a stacked pair did not — so the type goes up a step
            and the letter-spacing opens slightly, letting the name carry the
            whole width the two lines used to fill. */}
        <span className="relative block bg-gradient-to-r from-brand-dark to-brand bg-clip-text text-[15px] font-extrabold uppercase leading-none tracking-[0.18em] text-transparent">
          AFFHAN Shipping
        </span>

        <ArrowRight
          size={15}
          className="relative shrink-0 text-brand/70 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-brand"
        />
      </Link>
    </div>
  );
}
