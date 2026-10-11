"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { getCdnUrl } from "@/lib/cdn";

/**
 * Pictures for the homepage's sections below the fold: sized to where they
 * show, and loaded well before a quick scroll reaches them (the owner saw the
 * category grid's tiles arrive late, 2026-10-11).
 *
 * How far below the screen a section's pictures start loading: about three
 * phone screens, against the browser's own lazy loading at about one. Flung
 * at 5000px/s on 4G, 185 of the grid's 208 pictures used to be on screen
 * before they had loaded (0.66s typically); with this lead and pictures sized
 * to their tiles, none were. A fixed distance rather than a share of the
 * screen, so a tall monitor does not start everything on load, where nobody
 * has scrolled: these sections all start several screens down.
 */
export const AHEAD = "0px 0px 2400px 0px";

/**
 * True once the element is within AHEAD of the screen. One observer each, let
 * go of once it has answered. What it starts is never urgent (the element can
 * still be 2400px off; one already on screen loads its pictures by itself),
 * so it renders as a transition: the category grid's forty cards drawn at
 * once yield to a scroll still under way.
 */
export function useNear<T extends Element>() {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        startTransition(() => setNear(true));
      },
      { rootMargin: AHEAD },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return [ref, near] as const;
}

/**
 * The widths a picture is offered at: three each, so many screens share one
 * copy at the image handler's edge and a copy it has never made (a few
 * hundred milliseconds, once) is rare. 320, 480 and 200 are the widths these
 * pictures were always fetched at, and so are already made.
 */
export const TILE_WIDTHS = [160, 240, 320] as const;
export const TOP_WIDTHS = [320, 480, 640] as const;
export const THUMB_WIDTHS = [120, 200] as const;

const src = (url: string, px: number) => getCdnUrl(url, px) as string;

/**
 * A picture sized for its box, filling it (absolute, inset 0). next/image
 * cannot do this here: the site serves pictures unoptimized (next.config), so
 * it writes one src and no srcset, and every tile used to fetch the same
 * 320px picture whether it showed at 73px on a phone or 145px at a desk. Here
 * the browser picks from `widths` by `sizes` and the screen's density, which
 * the image handler cuts to order (lib/cdn.ts): 4.6KB at 160 against 12.8KB
 * at 320, on average, measured on the live grid. `near` (useNear) makes it
 * load at once; until then the browser's own lazy loading applies.
 */
export function Picture({ url, widths, sizes, near, className }: { url: string; widths: readonly number[]; sizes: string; near: boolean; className: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- next/image writes no srcset while images are unoptimized site-wide; this needs one.
    <img
      src={src(url, widths[widths.length - 1])}
      srcSet={widths.map((w) => `${src(url, w)} ${w}w`).join(", ")}
      sizes={sizes}
      alt=""
      loading={near ? "eager" : "lazy"}
      decoding="async"
      className={`absolute inset-0 h-full w-full ${className}`}
    />
  );
}

/** The product ids the page already shows (any link to a product), so a section loaded later can leave them out. */
export function productIdsOnPage(): Set<number> {
  const ids = new Set<number>();
  for (const a of document.querySelectorAll('a[href^="/products/"]')) {
    const m = /^\/products\/(\d+)(?:\/|$)/.exec(a.getAttribute("href") ?? "");
    if (m) ids.add(Number(m[1]));
  }
  return ids;
}
