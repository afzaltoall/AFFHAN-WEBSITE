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

/* Set when an overlay is closing *because* we are navigating away.

   Next's App Router navigates asynchronously — router.push awaits the RSC
   payload before it touches history — while React runs this hook's cleanup
   synchronously during the commit that follows setState. So in

       onClick={() => { setMenuOpen(false); router.push(href); }}

   the cleanup's history.back() lands first and cancels a navigation that has
   not yet pushed anything. Measured on the device: the whole tap produced one
   pushState (ours, on open) and one back, and router.push never reached
   history at all — the menu item simply did nothing.

   Checking whether our marker is still the current entry does not catch it,
   because at that instant it is: Next has not pushed yet. The only reliable
   signal is the caller saying so. */
let navigatingUntil = 0;
const NAV_GRACE_MS = 1500;

/**
 * Keep an overlay's history entry when it closes, instead of popping it.
 *
 * Two situations need this, and neither is distinguishable from inside the
 * hook — by the time cleanup runs, the state that would tell them apart has
 * not been written yet:
 *
 *   Navigating away. router.push is asynchronous, so a pop issued during the
 *   commit cancels a navigation that has not yet touched history.
 *
 *   Handing off to another overlay. The photo-search panel closes as the
 *   results dialog opens; history.back() delivers its popstate a beat later,
 *   by which point the dialog has pushed its own entry and is listening — so
 *   the pop closes the dialog the instant it appears.
 *
 * Leaving the entry costs nothing. It holds the URL we were already on, so
 * Back behaves identically whether or not it is there.
 */
export function overlayWillNavigate() {
  navigatingUntil = Date.now() + NAV_GRACE_MS;
}

/** Same mechanism, named for the overlay-to-overlay case. */
export const overlayHandoff = overlayWillNavigate;

/* Pops this hook caused itself, waiting to be recognised.

   history.back() does not fire popstate synchronously — the event arrives a
   task later. By then a listener may be attached that had nothing to do with
   the pop, and it will read a genuine "the user pressed Back".

   That is not hypothetical. In development React mounts every effect twice:
   push, clean up (which calls back()), push again. The back() from the first
   cleanup then lands on the second mount's listener, and the overlay closes
   roughly 250ms after opening — measured on the homepage, where the quote
   modal is mounted only while a product is selected, so the double-mount
   happens at the moment of opening rather than at page load.

   Counting our own pops separates the two cases exactly: a pop we asked for is
   swallowed once, and anything else is the user. */
let selfPops = 0;

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

    const hrefAtPush = window.location.href;
    let dismissedByBack = false;
    const onPop = () => {
      // A pop this hook asked for, arriving late. Not the user, so it must not
      // close anything — see the note on selfPops.
      if (selfPops > 0) {
        selfPops -= 1;
        return;
      }
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
      // Navigating away: leave the entry alone. It carries the URL we were
      // already on, so Back from the new page returns here exactly as it
      // would have anyway — and popping it now would cancel the navigation.
      if (Date.now() < navigatingUntil) return;
      // A navigation that has already committed is the same story.
      if (window.location.href !== hrefAtPush) return;

      const state = window.history.state as MarkerState;
      if (state && state[MARKER] === id) {
        selfPops += 1;
        window.history.back();
      }
    };
  }, [open]);
}
