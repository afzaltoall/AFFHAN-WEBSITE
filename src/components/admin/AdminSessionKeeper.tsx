"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the console's session alive while somebody is working, and notices when
 * it has ended.
 *
 * This replaces AdminAutoLogout, which ended the session from the browser
 * instead: a `pagehide` beacon and an unmount cleanup, both POSTing to
 * /api/auth/logout on the reasoning that a document going away meant the admin
 * had left the console.
 *
 * It does not. Next's router replaces the document by itself whenever an RSC
 * fetch comes back unusable — after a deployment, when the build id in the
 * response no longer matches the one the open tab was built from; on any
 * non-200; on a request that never arrives — and reloading does it too. Every
 * one of those fired the beacon, so ordinary clicking signed the admin out at
 * random, most visibly on Staff. Worse, the logout raced the new page: the tab
 * that came back usually looked signed in, and the next save 401'd.
 *
 * So nothing here ends a session. The rule — thirty minutes idle — is enforced
 * on the server in lib/session.ts against the timestamp the server signed. This
 * only does the two things a page is actually in a position to do:
 *
 *   1. While somebody is working, touch the session so the window slides
 *      forward. Throttled, so a busy mouse costs one request a minute.
 *   2. While a tab sits open, check often enough to take the reader to the
 *      login page with an explanation when the window has closed, rather than
 *      leaving a dead console on screen.
 *
 * Closing the tab needs no message: nothing touches the session after that, so
 * it lapses on its own, which is the one version of "signed out when you leave"
 * that a force-quit or a flat battery cannot skip.
 */

/** At most one keep-alive per minute, however much activity there is. */
const TOUCH_INTERVAL_MS = 60 * 1000;

/** How often an open tab checks whether it still has a session. */
const POLL_MS = 60 * 1000;

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "scroll", "touchstart"] as const;

export function AdminSessionKeeper() {
  const router = useRouter();
  const lastTouch = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const call = async (method: "GET" | "POST") => {
      try {
        const res = await fetch("/api/admin/session/", {
          method,
          cache: "no-store",
          credentials: "same-origin",
        });
        if (cancelled || res.status !== 401) return;
        const data = await res.json().catch(() => ({}));
        router.replace(data?.reason === "idle_expired" ? "/admin/login/?expired=1" : "/admin/login/");
      } catch {
        // Offline or a dropped request: say nothing and try again next time.
        // Signing somebody out because their wifi blinked is the bug this
        // component exists to stop repeating.
      }
    };

    const onActivity = () => {
      const now = Date.now();
      if (now - lastTouch.current < TOUCH_INTERVAL_MS) return;
      lastTouch.current = now;
      void call("POST");
    };

    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, onActivity, { passive: true });
    }
    const poll = window.setInterval(() => void call("GET"), POLL_MS);
    // Coming back to a tab that was in the background is exactly when the
    // answer is most likely to have changed.
    const onVisible = () => {
      if (document.visibilityState === "visible") void call("GET");
    };
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

export default AdminSessionKeeper;
