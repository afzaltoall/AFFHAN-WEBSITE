"use client";

import * as React from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export interface Speaker {
  name: string;
  role: string;
  hoverRole?: string;
  hideHoverRole?: boolean;
  /** Image URL. Square / portrait crops look best. */
  src: string;
  /** Optional class for adjusting image styles like object-position */
  imageClassName?: string;
}

export interface ScrollPortraitWallProps {
  /** Big sticky title rendered with `mix-blend-exclusion`. */
  title?: React.ReactNode;
  /** Small line under the title. */
  date?: React.ReactNode;
  /** Scroll hint that fades out as the wall comes into view. */
  hint?: React.ReactNode;
  /** People to scatter across the wall. Defaults to a built-in demo set. */
  speakers?: Speaker[];
  /** Columns on large screens (auto-reduced to 3 on `sm` and 2 on mobile). */
  columns?: number;
  /** Show the name / role caption under each portrait. Default `true`. */
  showCaptions?: boolean;
  className?: string;
}

/* Deterministic placement so SSR and client agree (no Math.random):
 * one portrait per row, with every third row holding a second one,
 * columns walked in a scattered pattern. Returns a grid of speaker
 * indices (or -1 for an empty cell). */
function buildLayout(count: number, cols: number): number[][] {
  const rows: number[][] = [];
  let i = 0;
  let r = 0;
  while (i < count) {
    const row = new Array<number>(cols).fill(-1);
    const a = (r * 2 + (r % 2)) % cols;
    row[a] = i++;
    if (r % 3 === 0 && i < count) {
      let b = (a + 2) % cols;
      if (b === a) b = (a + 1) % cols;
      row[b] = i++;
    }
    rows.push(row);
    r++;
  }
  return rows;
}

/* Keep portraits a usable size: cap the desired column count on smaller
 * viewports. Starts from `desired` so the SSR markup matches the first
 * client render, then narrows after mount. */
function useResponsiveColumns(desired: number): number {
  const [cols, setCols] = React.useState(desired);

  React.useEffect(() => {
    const sm = window.matchMedia("(min-width: 640px)");
    const lg = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      if (lg.matches) setCols(desired);
      else if (sm.matches) setCols(Math.min(desired, 3));
      else setCols(Math.min(desired, 2));
    };
    update();
    sm.addEventListener("change", update);
    lg.addEventListener("change", update);
    return () => {
      sm.removeEventListener("change", update);
      lg.removeEventListener("change", update);
    };
  }, [desired]);

  return cols;
}

export function ScrollPortraitWall({
  title = "Speakers",
  date = "Oct 22, 2025",
  hint = "scroll down to see effect",
  speakers = [],
  columns = 4,
  showCaptions = true,
  className,
}: ScrollPortraitWallProps) {
  const root = React.useRef<HTMLElement | null>(null);
  const hintRef = React.useRef<HTMLDivElement | null>(null);
  const cols = useResponsiveColumns(Math.max(1, columns));
  const layout = React.useMemo(
    () => buildLayout(speakers.length, cols),
    [speakers.length, cols],
  );


  useGSAP(
    () => {
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const items = gsap.utils.toArray<HTMLElement>(".spw-item");

      if (reduce) {
        gsap.set(items, { scale: 1 });
        return;
      }

      // Hint fades away over the first stretch of scrolling.
      gsap.to(hintRef.current, {
        autoAlpha: 0,
        ease: "none",
        scrollTrigger: {
          trigger: root.current,
          start: "top top",
          end: "+=40%",
          scrub: true,
        },
      });

      // Each portrait scrubs scale 0 → 1 → 0 across its full pass through the
      // viewport: it grows in from its transform-origin corner, peaks at
      // centre, then shrinks away — "comes and goes".
      items.forEach((el) => {
        gsap
          .timeline({
            scrollTrigger: {
              trigger: el,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          })
          .fromTo(
            el,
            { scale: 0 },
            { scale: 1, ease: "power2.out", duration: 0.5 },
          )
          .to(el, { scale: 0, ease: "power2.in", duration: 0.5 });
      });
    },
    { scope: root, dependencies: [cols, speakers], revertOnUpdate: true },
  );

  return (
    <section
      ref={root}
      aria-label={typeof title === "string" ? title : undefined}
      className={cn("relative w-full bg-white text-slate-900", className)}
    >
      {/* Scroll hint, lower-centre of the first screen, fading on scroll */}
      <div
        ref={hintRef}
        className="pointer-events-none absolute left-1/2 top-[60vh] grid -translate-x-1/2 content-start justify-items-center gap-6 text-center"
      >
        <span className="relative max-w-[12ch] text-xs uppercase leading-tight text-slate-500 after:absolute after:left-1/2 after:top-full after:h-16 after:w-px after:bg-gradient-to-b after:from-transparent after:to-slate-300 after:content-['']">
          {hint}
        </span>
      </div>

      {/* Sticky centred title — inverts against whatever portrait is behind it */}
      <div className="pointer-events-none sticky top-1/2 z-20 -translate-y-1/2 text-center text-white mix-blend-exclusion">
        <h2 className="text-5xl font-semibold tracking-tighter sm:text-7xl md:text-8xl lg:text-9xl">
          {title}
        </h2>
        {date && (
          <p className="mt-1 text-xs uppercase tracking-wide text-slate-500 sm:text-sm">
            {date}
          </p>
        )}
      </div>

      {/* The scattered portrait grid */}
      <div className="relative z-0 mb-[100vh] mt-[50vh]">
        {layout.map((row, ri) => (
          <div key={ri} className="flex w-full">
            {row.map((idx, ci) => {
              if (idx === -1)
                return <div key={ci} className="aspect-square flex-1" />;

              const s = speakers[idx];
              const origin = ci < cols / 2 ? "right bottom" : "left bottom";

              return (
                <div key={ci} className="aspect-square flex-1">
                  <div
                    className="spw-item relative h-full w-full"
                    style={{ transformOrigin: origin, transform: "scale(0)" }}
                  >
                    {/* Image + hover-reveal designation overlay */}
                    <motion.div
                      initial="rest"
                      animate="rest"
                      whileHover="hover"
                      className="relative h-full w-full overflow-hidden"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={s.src}
                        alt={s.name}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        className={cn(
                          "h-full w-full object-cover contrast-[1.15] transition-transform duration-500 ease-in-out",
                          s.role?.includes("CEO") ? "scale-[1.35] hover:scale-[1.45] translate-y-6" : "hover:scale-95",
                          s.imageClassName
                        )}
                      />

                      {!s.hideHoverRole && (s.hoverRole || s.role) ? (
                        <motion.div
                          variants={{ rest: { opacity: 0 }, hover: { opacity: 1 } }}
                          transition={{ duration: 0.25 }}
                          className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/85 via-black/35 to-transparent p-3 sm:p-4"
                        >
                          <motion.span
                            variants={{
                              rest: { y: 24, opacity: 0, scale: 0.85 },
                              hover: {
                                y: 0,
                                opacity: 1,
                                scale: 1,
                                transition: { type: "spring", stiffness: 260, damping: 20 },
                              },
                            }}
                            className="bg-gradient-to-br from-brand to-cyan-200 bg-clip-text text-[11px] font-black uppercase leading-snug tracking-wide text-transparent sm:text-sm"
                          >
                            {s.hoverRole || s.role}
                          </motion.span>
                        </motion.div>
                      ) : null}
                    </motion.div>

                    {/* Name and Role — always shown below, normal style */}
                    {showCaptions && s.name ? (
                      <div className={cn(
                        "absolute -bottom-2 left-0 w-full translate-y-full truncate text-center uppercase leading-tight text-slate-900",
                        (s.name.length + (s.role?.length || 0) > 40) ? "text-[10px] sm:text-[12px] tracking-tighter" 
                        : (s.name.length + (s.role?.length || 0) > 30) ? "text-[10.5px] sm:text-[13px] tracking-tight" 
                        : "text-[11px] sm:text-sm"
                      )}>
                        <span className="font-black text-slate-950">{s.name}</span>
                        {s.role ? (
                          <>
                            <span className="mx-1.5 text-slate-400 font-black">-</span>
                            <span className="font-black text-slate-950">{s.role}</span>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

export default ScrollPortraitWall;
