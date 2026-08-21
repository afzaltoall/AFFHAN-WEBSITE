"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export type PinnedPanelBlock = {
  id: string;
  heading: string;
  src: string;
  alt: string;
  /** Mobile/flow aspect ratio, e.g. "aspect-[4/5]". Written literally at the
   *  call site so Tailwind can find it — it scans source text. */
  aspect: string;
  body: string[];
};

/** Track height, one viewport of scroll per block.
 *
 *  A lookup rather than a template string: Tailwind only generates classes it
 *  can find as literal text, so `lg:h-[${n}00svh]` would compile to nothing and
 *  the track would collapse to the height of the sticky panel — the section
 *  would flash past with no scroll to drive it. */
const TRACK_HEIGHT: Record<number, string> = {
  2: "lg:h-[200svh]",
  3: "lg:h-[300svh]",
  4: "lg:h-[400svh]",
  5: "lg:h-[500svh]",
};

/**
 * Scroll-pinned panel: on lg+ the panel holds still for the height of the
 * track while the block inside it cross-fades, one at a time. Below lg the
 * whole thing is ordinary stacked flow.
 *
 * Every block stays mounted in the DOM at all times, which is the point. The
 * obvious implementation swaps content through AnimatePresence, but that
 * unmounts the inactive blocks and takes their copy out of the HTML with them.
 * On a page whose purpose is ranking that is the one thing not to do, so
 * inactive blocks are dimmed with opacity and left where they are.
 *
 * It reads better under mobile-first indexing too: the `lg:` variants never
 * apply at a phone viewport, so a crawler renders all blocks stacked and fully
 * visible, in flow, with no opacity involved at all.
 */
export function PinnedScrollPanel({
  blocks,
  className,
}: {
  blocks: PinnedPanelBlock[];
  className?: string;
}) {
  const [active, setActive] = useState(0);
  const sentinels = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.index);
          if (!Number.isNaN(index)) setActive(index);
        }
      },
      // A band across the middle of the viewport rather than the whole of it,
      // so exactly one sentinel qualifies at a time and the swap lands at the
      // centre of the screen instead of the moment a block clips an edge.
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 },
    );

    for (const el of sentinels.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // Sentinels are hidden below lg, so on a phone there is nothing to observe
    // and this costs nothing. Left unconditional rather than gated on a media
    // query so that resizing a window across the breakpoint still works.
  }, [blocks.length]);

  return (
    <div className={cn("lg:relative", TRACK_HEIGHT[blocks.length] ?? TRACK_HEIGHT[3], className)}>
      {/* Scroll markers, one viewport apart. Zero-width and aria-hidden: they
          carry no content and exist only to tell the observer where we are. */}
      <div className="hidden lg:block" aria-hidden="true">
        {blocks.map((block, i) => (
          <div
            key={block.id}
            ref={(el) => {
              sentinels.current[i] = el;
            }}
            data-index={i}
            className="absolute left-0 w-px"
            style={{ top: `${i * 100}svh`, height: "100svh" }}
          />
        ))}
      </div>

      {/* The panel that holds still. `lg:top-0 lg:h-svh` pins it to the full
          viewport; `lg:pt-24` clears the fixed navbar, matching the hero. */}
      <div className="lg:sticky lg:top-0 lg:flex lg:h-svh lg:items-center lg:pt-24 lg:pb-12">
        <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative space-y-14 lg:space-y-0 lg:min-h-[62svh]">
            {blocks.map((block, i) => (
              <div
                key={block.id}
                className={cn(
                  // In flow on mobile; stacked in the same place on desktop so
                  // they can cross-fade without any layout shift between them.
                  "lg:absolute lg:inset-0 lg:grid lg:grid-cols-2 lg:gap-12 xl:gap-16 lg:items-center",
                  "motion-safe:lg:transition-opacity motion-safe:lg:duration-500 motion-safe:lg:ease-out",
                  i === active
                    ? "lg:opacity-100"
                    : "lg:opacity-0 lg:pointer-events-none",
                )}
              >
                {/* Fixed aspect box reserves space before the file lands, so
                    nothing shifts. `lg:max-h-[62svh]` keeps a tall portrait
                    inside the pinned panel on short laptop screens instead of
                    overflowing it. Per-block ratios are safe here: the blocks
                    cross-fade rather than cover one another, so they do not
                    need to be the same shape — which is what lets the team
                    photo stay 3:2 with all six people in frame. */}
                <div
                  className={cn(
                    "relative w-full overflow-hidden rounded-3xl bg-slate-100 border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.06)]",
                    "lg:max-h-[62svh]",
                    block.aspect,
                  )}
                >
                  <Image
                    src={block.src}
                    unoptimized={false}
                    alt={block.alt}
                    fill
                    sizes="(max-width: 1024px) 100vw, 45vw"
                    className="object-cover"
                  />
                </div>

                <div className="mt-6 lg:mt-0">
                  <h3 className="text-xl sm:text-2xl font-semibold tracking-[-0.016em] leading-snug text-balance text-slate-900 mb-4">
                    {block.heading}
                  </h3>
                  {block.body.map((paragraph, j) => (
                    <p
                      key={j}
                      className="text-slate-600 text-[15px] sm:text-base leading-[1.75] tracking-[-0.003em] text-pretty mb-4 last:mb-0"
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Progress dots. Presentational only — the headings above are the
              real structure, so this is aria-hidden and not a control. */}
          <div className="hidden lg:flex items-center justify-center gap-2 pt-10" aria-hidden="true">
            {blocks.map((block, i) => (
              <span
                key={block.id}
                className={cn(
                  "h-1.5 rounded-full motion-safe:transition-all motion-safe:duration-500",
                  i === active ? "w-8 bg-[#1d7e93]" : "w-1.5 bg-slate-300",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
