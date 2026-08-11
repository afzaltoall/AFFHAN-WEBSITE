"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Shield, Package, Globe, type LucideIcon } from "lucide-react";

type Badge = {
  icon: LucideIcon;
  value: string;
  label: string;
};

const BADGES: Badge[] = [
  { icon: Shield, value: "50,000+ Verified", label: "Suppliers" },
  { icon: Package, value: "6 Lakhs+", label: "Products" },
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

  // Measure each badge's position relative to the row (re-measured on resize).
  useLayoutEffect(() => {
    const measure = () => {
      const row = rowRef.current;
      if (!row) return;
      const base = row.getBoundingClientRect().left;
      const next = badgeRefs.current.map((el) => {
        if (!el) return { left: 0, width: 0 };
        const r = el.getBoundingClientRect();
        return { left: r.left - base, width: r.width };
      });
      setRects(next);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
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
            animate={{ left: box.left - 8, width: box.width + 16 }}
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
              className="relative z-10 flex flex-col gap-0.5 cursor-default px-1"
            >
              <div className="flex items-center gap-1 sm:gap-1.5 text-[11px] sm:text-xs font-bold text-slate-700 whitespace-nowrap">
                <Icon
                  className={`w-3.5 h-3.5 shrink-0 transition-colors duration-500 ${
                    isActive ? "text-brand" : "text-slate-400"
                  }`}
                />
                <span>{b.value}</span>
              </div>
              <span className="text-center text-[9px] sm:text-[10px] text-slate-500 whitespace-nowrap uppercase tracking-wider">
                {b.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
