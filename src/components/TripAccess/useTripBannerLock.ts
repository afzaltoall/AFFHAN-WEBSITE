"use client";

import { useCallback, useEffect, useState } from "react";
import { BREAK, BREAK_REDUCED } from "./TripLockOverlay";

/**
 * The trip banner's lock, on the page: "locked", "breaking" (it is opening in
 * front of the visitor), "released" (it has let go: the banner is open, and
 * the last of the frost is still clearing), then "open".
 */
export type TripBannerPhase = "locked" | "breaking" | "released" | "open";

export interface TripBannerLock {
  phase: TripBannerPhase;
  /** It opened in front of this visitor, rather than being open when the page came. */
  live: boolean;
  /** Presses on the lock so far: each one shakes it (TripLockOverlay) and the call (TripCall). */
  rattle: number;
  press: () => void;
}

/** How often a locked banner asks whether an admin has unlocked it (give or take 15%). */
const POLL_MS = 10_000;

/**
 * The homepage trip banner's lock (lib/trip-lock.ts), kept for both
 * copies of the banner at once (the corner's, and the one under the search
 * below xl), so the page asks the server once, not once per copy.
 *
 * `locked` is what the server rendered. While it is locked the page asks
 * /api/trip-lock/ every ten seconds or so, while the tab is in view, and
 * again the moment it comes back into view; when the answer is no longer
 * locked, it opens where the visitor can see it. An open page never
 * asks: locking it again is for the visits after that.
 *
 * This keeps the break's time (BREAK), not the drawing: one copy of the
 * banner is always hidden (display:none), and only one should be heard.
 */
export function useTripBannerLock(locked: boolean): TripBannerLock {
  const [phase, setPhase] = useState<TripBannerPhase>(locked ? "locked" : "open");
  const [rattle, setRattle] = useState(0);
  const press = useCallback(() => setRattle((n) => n + 1), []);

  useEffect(() => {
    if (phase !== "locked") return;
    let stopped = false;
    let timer = 0;
    const ask = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        // The browser's default cache mode: the answer is max-age=0, so it
        // is never reused, and no no-cache header goes out to make the
        // edge skip its five-second copy (the route).
        const res = await fetch("/api/trip-lock/");
        if (!res.ok) return;
        const json = (await res.json()) as { locked?: unknown };
        if (!stopped && json.locked === false) setPhase("breaking");
      } catch {
        /* offline, or a hiccup: ask again next time */
      }
    };
    const next = () => {
      timer = window.setTimeout(() => {
        void ask().finally(() => {
          if (!stopped) next();
        });
      }, POLL_MS * (0.85 + Math.random() * 0.3));
    };
    next();
    const onShow = () => void ask();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [phase]);

  // The break's two beats: it lets go, then the last of it has fallen.
  useEffect(() => {
    if (phase !== "breaking" && phase !== "released") return;
    const beats = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? BREAK_REDUCED : BREAK;
    const ms = (phase === "breaking" ? beats.release : beats.done - beats.release) * 1000;
    const t = window.setTimeout(() => setPhase(phase === "breaking" ? "released" : "open"), ms);
    return () => window.clearTimeout(t);
  }, [phase]);

  return { phase, live: locked && phase !== "locked", rattle, press };
}
