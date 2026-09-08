import { useEffect, useLayoutEffect } from "react";

// useLayoutEffect on the client, useEffect on the server.
//
// Needed because the homepage sections re-pick their products after hydration.
// Doing that in useEffect runs AFTER the browser has painted the server's set,
// so the swap is a visible layout change and the browser records it as a layout
// shift — measured at CLS 0.93-1.06 on production, against 0.00-0.09 with the
// shuffle disabled. useLayoutEffect runs after the DOM is updated but BEFORE
// paint, so the first thing drawn is already the shuffled set and there is
// nothing to shift.
//
// React warns if useLayoutEffect is called during server rendering, where it
// does nothing useful. These are "use client" components but Next still renders
// them on the server for the initial HTML, so the hook is swapped for useEffect
// there — the standard isomorphic pattern.
//
// This does NOT reintroduce a hydration mismatch: the render output still
// matches the server exactly. Only the effect timing changes.
export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;
