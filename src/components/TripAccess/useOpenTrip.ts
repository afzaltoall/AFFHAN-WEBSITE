"use client";

import type { MouseEvent as ReactMouseEvent } from "react";
import { useRouter } from "next/navigation";
import { useQuoteGate } from "@/context/QuoteGateContext";
import { TRIP_SIGN_IN } from "./content";
import { tripEntryHref } from "./useTripStatus";

/**
 * Opens the Free China Business Trip from a press on its banner, its call
 * (TripCall) or its place in the navbar (TripNavLink). The trip is for
 * signed-in visitors, so a press asks first: the site's sign-in popup if
 * nobody is signed in (the trip opens the moment they are), and then the
 * trip's page, or the participants board for someone who has registered
 * already. Ctrl, ⌘, Shift, Alt or a middle click still open a new tab, as
 * links do, and the trip's own gate asks there.
 *
 * Its own module, not TripCall's: the navbar is on every page, and importing
 * this from TripCall would bring the call's stylesheet with it.
 */
export function useOpenTrip() {
  const router = useRouter();
  const { requireLogin } = useQuoteGate();
  return (e: ReactMouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    requireLogin(() => void tripEntryHref().then((href) => router.push(href)), TRIP_SIGN_IN.reason);
  };
}
