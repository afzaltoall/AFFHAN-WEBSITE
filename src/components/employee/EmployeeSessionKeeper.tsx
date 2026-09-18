"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { armSessionKeeper, sessionRequest } from "@/lib/session-client";

/**
 * Keeps a working session alive, and notices when it has ended.
 *
 * Two jobs, neither of them enforcement — the timeout is enforced in
 * lib/employee-session.ts, on the server, against the timestamp the server
 * itself signed:
 *
 *   1. While somebody is actually working, ping the session route so the
 *      thirty-minute window slides forward. Throttled, so a busy mouse costs
 *      one request a minute rather than one a frame.
 *   2. While a tab sits open and idle, poll often enough to notice that the
 *      window has closed and take the reader to the login page with an
 *      explanation, instead of leaving a dead console on screen until they
 *      click something and get a 401.
 *
 * Neither can buy extra time. A page that keeps pinging past the window is
 * told the session is over; a page that stops pinging simply lets it lapse.
 */

/** At most one keep-alive per minute, however much activity there is. */
const TOUCH_INTERVAL_MS = 60 * 1000;

/** How often an idle tab checks whether it still has a session. */
const POLL_MS = 60 * 1000;

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export function EmployeeSessionKeeper() {
  const router = useRouter();
  const lastTouch = useRef(0);

  useEffect(() => {
    let cancelled = false;
    // This screen only renders for a live session, so whatever a previous one
    // in this document did, we are not signing out now.
    armSessionKeeper();

    // POST touches the session, GET only asks about it — so the idle poll
    // below cannot hold a window open that nobody is working in. Both go
    // through lib/session-client, so a Sign out on this screen is never undone
    // by the keep-alive its own click set off.
    const check = async (method: "GET" | "POST" = "GET") => {
      try {
        const res = await sessionRequest("/api/employee/auth/session/", method);
        if (cancelled || !res) return;
        if (res.status === 401) {
          const data = await res.json().catch(() => ({}));
          const reason = data?.reason === "idle_expired" ? "expired=1" : "signedout=1";
          router.replace(`/employee/login/?${reason}`);
        }
      } catch {
        // Offline or a dropped request: say nothing and try again next time.
        // Signing somebody out because their wifi blinked would be worse than
        // waiting for the next check.
      }
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastTouch.current < TOUCH_INTERVAL_MS) return;
      lastTouch.current = now;
      void check("POST");
    };

    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, onActivity, { passive: true });
    }
    const poll = window.setInterval(() => void check(), POLL_MS);
    // Coming back to a tab that was in the background is exactly when the
    // answer is most likely to have changed.
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}

export default EmployeeSessionKeeper;
