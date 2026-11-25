"use client";

import { useEffect } from "react";
import { APPLICATION_WINDOW } from "@/lib/trip-application";

/** Once the moment has come, how often the page asks whether the door has closed: the server's clock may trail this one. */
const ASK_MS = 4000;
/** …and after three minutes of no, less often: this browser's clock is wrong, and the door decides. */
const ASK_SLOW_MS = 30_000;
const SLOW_AFTER_MS = 180_000;
/** Until the moment, the page wakes at least this often: a sleeping tab's timer can come late, never early. */
const WAKE_MS = 60_000;

/**
 * A trip page left open as applications close (the owner, 2026-11-25: "it have to auto change to lock") turns into
 * the countdown to the winners by itself, at the same address, the moment the door has closed (proxy.ts). At the last
 * moment of 25 November, IST, by this browser's clock, it asks the door for its own address (HEAD), and reloads only
 * when the answer says the trip has closed (X-Trip-Closed), so a clock that runs ahead never reloads it in a loop: it
 * asks again a few seconds later until the door agrees. Also when the tab comes back into view.
 *
 * Nothing while the trip is open but one timer; never on a development server, which never closes (applicationWindow).
 */
export function TripCloseWatch() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    let timer = 0;
    let stopped = false;
    let asking = false;
    const check = async () => {
      if (stopped || asking) return;
      window.clearTimeout(timer);
      const left = APPLICATION_WINDOW.closes - Date.now();
      if (left > 0) {
        timer = window.setTimeout(() => void check(), Math.min(left + 250, WAKE_MS));
        return;
      }
      asking = true;
      let closed = false;
      try {
        const res = await fetch(window.location.href, { method: "HEAD", cache: "no-store", credentials: "same-origin" });
        closed = res.headers.get("x-trip-closed") === "closed";
      } catch {
        /* a hiccup: ask again */
      }
      asking = false;
      if (stopped) return;
      if (closed) {
        window.location.reload();
        return;
      }
      timer = window.setTimeout(() => void check(), -left > SLOW_AFTER_MS ? ASK_SLOW_MS : ASK_MS);
    };
    void check();
    const onShow = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, []);
  return null;
}
