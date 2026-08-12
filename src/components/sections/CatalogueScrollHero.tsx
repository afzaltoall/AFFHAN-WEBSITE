"use client";

import { ScrollChoreography } from "@/components/ui/scroll-choreography";

/**
 * Opening scroll-choreography for the catalogue. Four real product images
 * drift, stack, and expand into a full-bleed hero as you scroll. Desktop only —
 * the vw/vh choreography is deliberately not run on small screens (it degrades
 * to nothing there), so mobile users drop straight into the catalogue.
 */
export function CatalogueScrollHero({ scatterImages = [] }: { scatterImages?: string[] }) {
  const imgs = [
    "/full catalogue/discover.png",
    "/full catalogue/verify.png",
    "/full catalogue/customize.png",
    "/full catalogue/Deliver.png",
  ];

  const deliveryIcons = [
    "/Delivery/icon-1.png",
    "/Delivery/icon-2.png",
    "/Delivery/icon-3.png",
    "/Delivery/icon-4-bg-removed.png",
    "/Delivery/icon-5.png",
    "/Delivery/icon-6-bg-removed.png",
    "/Delivery/icon-7-bg-removed.png",
    "/Delivery/icon-8-bg-removed.png",
  ];

  const finalScatter = [...scatterImages];
  while (finalScatter.length < 10) {
    finalScatter.push("");
  }

  // Left side (4 items)
  finalScatter[0] = deliveryIcons[7]; // Van
  finalScatter[8] = deliveryIcons[1]; // Megaphone
  finalScatter[2] = deliveryIcons[2]; // Cart
  finalScatter[4] = deliveryIcons[3]; // Forklift

  // Right side (4 items)
  finalScatter[1] = deliveryIcons[5]; // Flight
  finalScatter[3] = deliveryIcons[4]; // Train
  finalScatter[7] = deliveryIcons[6]; // Ship
  finalScatter[9] = deliveryIcons[0]; // Window

  // Clear specific side images
  finalScatter[5] = ""; // Removed the timer image
  finalScatter[6] = ""; // Removed the tick image

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
        scatter={finalScatter}
      />
    </div>
  );
}
