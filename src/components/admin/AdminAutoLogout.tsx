"use client";

import { useEffect } from "react";

// Security hardening: the admin session ends the moment the admin leaves the
// /admin screen — navigating to another route (About, a product, the logo…),
// closing the tab, or hard-reloading the page. Coming back to /admin then
// requires a fresh login. This is deliberate: the console is the most valuable
// surface on the site, and a session that outlives the window it was opened in
// is a session someone else can find.
//
// This component is mounted ONLY inside the admin area, so its unmount is, by
// construction, "the admin left /admin". Two exit paths are covered:
//   1. In-app (SPA) navigation to another route — React unmounts us while the
//      page stays alive, so a normal keepalive fetch clears the cookie.
//   2. Full-page exit (close tab / hard refresh / typing a new URL) — the page
//      is unloading and a fetch would be cancelled, so we use sendBeacon, which
//      the browser guarantees to deliver.
//
// The browser fires `pagehide` the same way for a close and for a reload and
// gives no way to tell them apart, so both end the session. That is the
// intended trade: a stray Ctrl+R costs one login, and nothing is left signed in
// behind a closed tab.
//
// Note: the console's own "Refresh" button uses router.refresh() — an SPA data
// refresh that neither unmounts this component nor unloads the page — so it
// does NOT log the admin out. Use that button rather than the browser's reload
// when you only want fresh data.
//
// A third exit, added on top of the two above: sitting idle. Thirty minutes
// with no mouse, key, touch or scroll and the session ends on its own. This
// covers the case none of the others can — the admin who walks away and leaves
// the console open on an unlocked machine.

// Trailing slash matches next.config `trailingSlash: true`; without it the
// request 308-redirects, which sendBeacon will not follow.
const LOGOUT_URL = "/api/auth/logout/";

/** No mouse, key, touch or scroll for this long and the session ends. */
const IDLE_MS = 30 * 60 * 1000;

export function AdminAutoLogout() {
  useEffect(() => {
    // React StrictMode (on in dev) mounts → unmounts → remounts once on load.
    // Only treat an unmount as a real navigation once the component has settled
    // a tick, so that dev double-invoke doesn't log the admin straight out.
    let armed = false;
    const settle = setTimeout(() => {
      armed = true;
    }, 0);

    const onPageHide = () => {
      try {
        navigator.sendBeacon(LOGOUT_URL);
      } catch {
        /* best effort */
      }
    };
    window.addEventListener("pagehide", onPageHide);

    // Idle logout. Sent to the login screen rather than left sitting on a
    // console whose every request will now be refused, which just looks broken.
    let idle: ReturnType<typeof setTimeout>;
    const onIdle = () => {
      try {
        void fetch(LOGOUT_URL, { method: "POST", cache: "no-store" });
      } catch {
        /* best effort */
      }
      window.location.href = "/admin/login";
    };
    const resetIdle = () => {
      clearTimeout(idle);
      idle = setTimeout(onIdle, IDLE_MS);
    };
    const ACTIVITY = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "wheel"] as const;
    ACTIVITY.forEach((e) => window.addEventListener(e, resetIdle, { passive: true }));
    resetIdle();

    return () => {
      clearTimeout(settle);
      clearTimeout(idle);
      window.removeEventListener("pagehide", onPageHide);
      ACTIVITY.forEach((e) => window.removeEventListener(e, resetIdle));
      if (armed) {
        try {
          fetch(LOGOUT_URL, { method: "POST", keepalive: true, cache: "no-store" });
        } catch {
          /* best effort */
        }
      }
    };
  }, []);

  return null;
}
