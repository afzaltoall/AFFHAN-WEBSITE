"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";

/** The countdown's own address: before the close an admin's alone (proxy.ts), after it every trip page shows it. */
const PAGE = "/free-china-trip/closed/";

/**
 * The page at a device's own size (its layout is the one that device gets), scaled down to fit its column, live: the
 * clock runs, and a press inside plays the tick as the page does.
 */
function Frame({ label, width, height, max }: { label: string; width: number; height: number; max: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(max, el.clientWidth / width));
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [width, max]);
  return (
    <figure className="m-0 min-w-0">
      <figcaption className="mb-2 text-[12px] font-medium text-[#6e6e73]">
        {label} · {width} × {height}
      </figcaption>
      <div ref={box} className="w-full">
        <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-[#070608]" style={{ width: width * scale, height: height * scale }}>
          {scale > 0 && (
            <iframe
              src={PAGE}
              title={`The countdown on a ${label.toLowerCase()}`}
              width={width}
              height={height}
              style={{ display: "block", border: 0, transform: `scale(${scale})`, transformOrigin: "0 0" }}
            />
          )}
        </div>
      </div>
    </figure>
  );
}

/**
 * Free China Trip → Countdown: the page every trip page shows once applications close, on a computer and on a phone,
 * as visitors see it, and a way to open it full size. Says plainly when visitors see it.
 */
export function TripCountdownPreview({ closed, closes }: { closed: boolean; closes: string }) {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-[#1d1d1f]">Countdown</h1>
          <p className="mt-1 max-w-[46rem] text-[13px] leading-relaxed text-[#6e6e73]">
            {closed
              ? "Applications are closed: every Free China Trip page shows this to everyone now. The Terms and Privacy Policy stay readable."
              : `Visitors see the trip as it is until 11:59 pm on ${closes}. From 12:00 am every Free China Trip page shows this to everyone, by itself. Until then only an admin can see it.`}
          </p>
        </div>
        <a
          href={PAGE}
          target="_blank"
          rel="noopener"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#1d1d1f] px-4 py-2 text-[13px] font-medium text-white transition hover:bg-black"
        >
          Open full size
          <ExternalLink aria-hidden size={14} strokeWidth={2} />
        </a>
      </header>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Frame label="Computer" width={1440} height={900} max={1} />
        <Frame label="Phone" width={390} height={844} max={0.77} />
      </div>
    </div>
  );
}
