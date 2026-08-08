"use client";

import { ScrollChoreography } from "@/components/ui/scroll-choreography";

/**
 * Opening scroll-choreography for the catalogue. Four real product images
 * drift, stack, and expand into a full-bleed hero as you scroll. Desktop only —
 * the vw/vh choreography is deliberately not run on small screens (it degrades
 * to nothing there), so mobile users drop straight into the catalogue.
 */
export function CatalogueScrollHero() {
  const imgs = [
    "/full catalogue/discover.png",
    "/full catalogue/verify.png",
    "/full catalogue/customize.png",
    "/full catalogue/Deliver.png",
  ];

  return (
    <div className="hidden lg:block relative">
      <div className="pointer-events-none absolute top-10 left-1/2 -translate-x-1/2 z-50 text-center">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.25em] text-brand">
          Global Sourcing
        </span>
        <h2 className="mt-2 text-3xl xl:text-4xl font-black tracking-tight text-slate-900">
          Anything you can picture, we can source
        </h2>
      </div>
      <ScrollChoreography
        images={{ topLeft: imgs[0], topRight: imgs[1], bottomLeft: imgs[2], bottomRight: imgs[3] }}
      />
    </div>
  );
}
