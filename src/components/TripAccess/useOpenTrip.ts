"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { useRouter } from "next/navigation";
import { tripEntryHref } from "./useTripStatus";

/**
 * Opens the Free China Business Trip from a press on its banner, its call
 * (TripCall) or its place in the navbar (TripNavLink). Nothing is asked first:
 * the trip needs no sign-in (the owner, 2026-10-28). It opens on the trip's
 * page, on a phone on the application itself, or on their boarding pass for
 * someone who has registered already (tripEntryHref). Ctrl, ⌘, Shift, Alt or a middle click
 * still open a new tab, as links do.
 *
 * Its own module, not TripCall's: the navbar is on every page, and importing
 * this from TripCall would bring the call's stylesheet with it.
 */
export function useOpenTrip() {
  const router = useRouter();
  return (e: ReactMouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void tripEntryHref().then((href) => router.push(href));
  };
}
