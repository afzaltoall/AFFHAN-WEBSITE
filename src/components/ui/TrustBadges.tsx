"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Shield, Package, Globe, type LucideIcon } from "lucide-react";

type Badge = {
  icon: LucideIcon;
  value: string;
  label: string;
};

// "500+ Verified", not the "50,000+" this carried before. The catalog holds
// 634 categories, 509 of which actually contain products — the CJ tree is three
// levels deep and that is the whole of it, so the figure was out by roughly two
// orders of magnitude and could never grow into the claim.
const BADGES: Badge[] = [
  { icon: Shield, value: "500+ Verified", label: "Categories" },
  { icon: Package, value: "10 Lakhs+", label: "Products" },
  { icon: Globe, value: "100+ Countries", label: "Trusted Global" },
];

const CYCLE_MS = 1800;

/**
 * Trust badges — three static stats. A single blue highlight box slides
 * left → right across them on a loop (no text transitions). The box position
 * is measured from each badge so it fits perfectly at any width; when it wraps
 * from the last badge back to the first it resets instantly (no backward
 * slide), preserving the strict left-to-right motion.
 */
export function TrustBadges() {
  const [active, setActive] = useState(0);
  const [instant, setInstant] = useState(false);
  const [rects, setRects] = useState<{ left: number; width: number }[]>([]);
  const [paused, setPaused] = useState(false);

  const rowRef = useRef<HTMLDivElement>(null);
  const badgeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const prev = useRef(0);

  // Measure each badge's position relative to the row.
  //
  // This used to measure once on mount and then only on window resize, which
  // is wrong as often as it is right: the first layout happens on the fallback
  // font, and when the webfont swaps in, every badge changes width underneath
  // a box that is still sized and placed for the old metrics. The result is a
  // highlight that sits in the gap between two badges rather than around one.
  // The window never resized, so nothing ever corrected it.
  //
  // A ResizeObserver on the row and on each badge catches all of it — the font
  // swap, a container resize, a zoom change, an HMR re-layout — and the box is
  // absolutely positioned, so re-measuring can never feed back into layout and
  // loop. document.fonts.ready is belt-and-braces for the swap specifically.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const measure = () => {
      const base = row.getBoundingClientRect().left;
      const next = badgeRefs.current.map((el) => {
        if (!el) return { left: 0, width: 0 };
        const r = el.getBoundingClientRect();
        return { left: r.left - base, width: r.width };
      });
      // Only commit a real change, so the observer cannot churn renders.
      setRects((prevRects) =>
        prevRects.length === next.length &&
        prevRects.every(
          (p, i) =>
            Math.abs(p.left - next[i].left) < 0.5 &&
            Math.abs(p.width - next[i].width) < 0.5
        )
          ? prevRects
          : next
      );
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(row);
    badgeRefs.current.forEach((el) => el && ro.observe(el));
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setActive((i) => {
        const next = (i + 1) % BADGES.length;
        // Wrapping to the first badge: jump instantly, no backward slide.
        setInstant(next === 0 && i === BADGES.length - 1);
        prev.current = i;
        return next;
      });
    }, CYCLE_MS);
    return () => clearInterval(t);
  }, [paused]);

  const box = rects[active];

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="w-full lg:flex-1 flex justify-center lg:justify-start"
    >
      <div
        ref={rowRef}
        className="relative flex items-center gap-3 sm:gap-5 xl:gap-7 py-1"
      >
        {/* Sliding blue highlight box */}
        {box && box.width > 0 && (
          <motion.div
            aria-hidden
            className="absolute top-0 bottom-0 rounded-xl bg-brand/12 ring-1 ring-brand/25"
            initial={false}
            animate={{ x: box.left - 8 }}
            style={{ width: box.width + 16 }}
            transition={
              instant
                ? { duration: 0 }
                : { type: "spring", stiffness: 260, damping: 30 }
            }
          />
        )}

        {BADGES.map((b, i) => {
          const Icon = b.icon;
          const isActive = i === active;
          return (
            <div
              key={b.label}
              ref={(el) => {
                badgeRefs.current[i] = el;
              }}
              className="relative z-10 flex items-center gap-2 cursor-default px-1"
            >
              {/* The icon sits beside the two-line column, not inside the top
                  line of it. Inside, the figure began 22px in (icon + gap)
                  while the caption below spanned the whole block and centred
                  itself — so every caption sat 11px left of the figure it
                  captions, measured, on all three. Three near-misses in a row
                  is what read as unfinished. Out here the two lines share one
                  left edge by construction, whichever of them is wider.

                  2.25 stroke, 18px: at 16px/2 the glyph was lighter than the
                  bold text beside it and the pair looked mismatched. */}
              <Icon
                strokeWidth={2.25}
                className={`w-[18px] h-[18px] shrink-0 transition-colors duration-500 ${
                  isActive ? "text-brand" : "text-slate-500"
                }`}
              />
              <div className="flex flex-col gap-[3px]">
                {/* A step up in size and weight, and slate-900 rather than
                    slate-800. At 11px these figures were the smallest type on
                    the page while carrying the numbers the page is trying to
                    be believed on. Leading is pinned tight because the default
                    1.43 padded a 20px line box around 14px text and opened a
                    gap the caption then had to jump. */}
                <span className="text-sm sm:text-[15px] font-bold leading-[1.1] tracking-tight text-slate-900 whitespace-nowrap">
                  {b.value}
                </span>
                {/* Never lighter than slate-600 here, and this is slate-700.
                    The sliding highlight passes behind each label in turn, and
                    bg-brand/12 over white is #e5f5f8 — enough to drop slate-500
                    from 4.76:1 to 4.25:1, under AA, for a third of the cycle.
                    Softening the highlight does not fix it (bg-brand/8 only
                    reaches 4.41:1); darkening the label does. slate-600 was
                    7.58:1 on white and 6.77:1 under the highlight; slate-700 is
                    better again on both, and leaves a real step down from the
                    slate-900 figure above it.

                    Also up a size and to semibold. 9px uppercase at normal
                    weight, letter-spaced, is about as hard as small type gets
                    to read — the tracking that makes a label like this look
                    deliberate is the same thing that thins it out. */}
                <span className="text-[10px] sm:text-[11px] font-semibold leading-none text-slate-700 whitespace-nowrap uppercase tracking-wider">
                  {b.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
