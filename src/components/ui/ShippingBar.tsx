"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SHIP_MARK_NAV } from "@/lib/shipMarkAssets";

/**
 * The way through to the shipping side, in the hero.
 *
 * It used to be a bare sail in the navbar's link row — decorative, unlabelled,
 * and impossible to guess at. Out here it carries its own name, which is what
 * makes it a destination rather than an ornament.
 *
 * Where it sits depends on the width, because the room does. On a window
 * 1536px or wider it goes beside the headline, under the Affhan.com lockup and
 * sharing its left edge. Narrower than that there is no room there: the pill
 * is 288px and the space left of the headline, measured on the live page, is
 * 268px at 1280 and 348px at 1440, so it would run into the headline. There it
 * keeps its place at the end of the badge line.
 *
 * The hero renders one of each (`placement`). Exactly one is displayed at any
 * width; the other is display:none, so it is neither announced nor tabbed to.
 *
 * Absolutely positioned either way, so the badge and the headline stay centred
 * and nothing else in the hero moves. Desktop only: at narrow widths it would
 * sit on top of the badge, and the mobile drawer already has a named Shipping
 * row.
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

/** 2xl is Tailwind's 1536px: the width from which it fits beside the headline. */
const PLACEMENT = {
  // left-10 is the lockup's own xl:left-10, so the two share an edge.
  headline: "absolute left-10 top-1/2 hidden -translate-y-1/2 2xl:block",
  // right-12 rather than right-0 from xl: pulled in off the container edge so
  // it sits inside the hero's rhythm instead of against its margin. Flush on
  // lg, because there is no room for the inset: at 1024px the centred badge
  // ends at 685 and right-12 would start the pill at 656, on top of it.
  badge: "absolute right-0 xl:right-12 top-1/2 hidden -translate-y-1/2 lg:block 2xl:hidden",
} as const;

export function ShippingBar({ placement = "badge" }: { placement?: keyof typeof PLACEMENT }) {
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

  return (
    <div className={PLACEMENT[placement]}>
      <Link
        ref={ref}
        href="/shipping/"
        onMouseEnter={(e) => splashAt(e.clientX, e.clientY)}
        onMouseMove={(e) => splashAt(e.clientX, e.clientY)}
        className="group relative flex items-center gap-3 overflow-hidden rounded-full border border-brand/30 bg-white/75 py-2 pl-2.5 pr-5 shadow-md backdrop-blur-sm transition-all hover:border-brand/60 hover:bg-white hover:shadow-lg"
      >
        {/* The splash layer. Clipped to the pill and inert, so it can never take
            a click meant for the link underneath it. */}
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

        {/* Sea along the bottom of the pill. Three layers at different speeds
            and opacities — a single wave reads as a decal, while layers drifting
            past each other read as water, because that parallax is what depth
            looks like on a real surface. */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-5 overflow-hidden">
          <span className="ship-wave ship-wave--back" />
          <span className="ship-wave ship-wave--mid" />
          <span className="ship-wave ship-wave--front" />
        </span>

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
        </span >

        {/* The name on its own. A one-line label sits on the pill's optical
            centre, which a stacked pair did not — so the type goes up a step
            and the letter-spacing opens slightly, letting the name carry the
            whole width the two lines used to fill. */}
        <span className="relative block bg-gradient-to-r from-brand-dark to-brand bg-clip-text text-[15px] font-extrabold uppercase leading-none tracking-[0.18em] text-transparent">
          Affhan Shipping
        </span>

        <ArrowRight
          size={15}
          className="relative shrink-0 text-brand/70 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-brand"
        />
      </Link>
    </div>
  );
}
