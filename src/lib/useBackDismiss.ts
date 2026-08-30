"use client";

import { useEffect, useRef } from "react";

/**
 * Make the Android back button close an overlay instead of leaving the page.
 *
 * In the browser this changes almost nothing: nobody expects Backspace or the
 * browser's back arrow to close a dialog, and the extra history entry is
 * consumed and removed again without the URL ever changing. It exists for the
 * Android app, where the shell wires the hardware back button to the WebView's
 * history (see MainActivity in the AFFHAN-ANDROID repo). Without an entry to
 * consume, a customer who opens a quote form three levels into the catalogue
 * and taps Back does not close the form — they lose the page behind it.
 *
 * The entry carries no URL. pushState is called with the current href so the
 * address bar, the router and any deep link stay exactly as they were; the
 * only thing that changes is that there is now something for Back to pop.
 */

const MARKER = "__affhanOverlay";

type MarkerState = Record<string, unknown> | null;

export function useBackDismiss(open: boolean, onClose: () => void) {
  // Held in a ref so a caller passing an inline arrow function does not tear
  // the history entry down and rebuild it on every render.
  const closeRef = useRef(onClose);
  // Refreshed in an effect, not during render. Writing a ref while rendering
  // is unsafe under concurrent rendering, where a render can be thrown away.
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    // Unique per opening, so nested overlays — the lightbox inside the quote
    // form, or a quote form opened from the photo-search results — each own
    // their own entry and unwind in the right order.
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.history.pushState({ [MARKER]: id }, "", window.location.href);

    let dismissedByBack = false;
    const onPop = () => {
      dismissedByBack = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);

    return () => {
      window.removeEventListener("popstate", onPop);
      if (dismissedByBack) return;

      // Closed some other way — the X, Escape, a click on the backdrop. The
      // entry we pushed is still on the stack, and leaving it there would
      // cost the user a wasted Back press that appears to do nothing.
      //
      // Guarded on the marker still being the current entry. Without that, an
      // overlay unmounted by a navigation (a link inside it, or a route
      // change) would call back() and undo the very navigation that closed it.
      const state = window.history.state as MarkerState;
      if (state && state[MARKER] === id) window.history.back();
    };
  }, [open]);
}
