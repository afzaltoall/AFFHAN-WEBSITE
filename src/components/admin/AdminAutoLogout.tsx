"use client";

import { useEffect } from "react";

// Security hardening: the admin session ends the moment the admin leaves the
// /admin screen — navigating to another route (About, a product, the logo…),
// closing the tab, or hard-reloading the page. Coming back to /admin then
// requires a fresh login.
//
// This component is mounted ONLY inside the admin page, so its unmount is, by
// construction, "the admin left /admin". Two exit paths are covered:
//   1. In-app (SPA) navigation to another route — React unmounts us while the
//      page stays alive, so a normal keepalive fetch clears the cookie.
//   2. Full-page exit (close tab / hard refresh / typing a new URL) — the page
//      is unloading and a fetch would be cancelled, so we use sendBeacon, which
//      the browser guarantees to deliver.
//
// Note: the in-app "Refresh" button uses router.refresh() (an SPA data refresh
// that neither unmounts this component nor unloads the page), so it does NOT
// log the admin out. Only a real browser reload / leaving the page does.

// Trailing slash matches next.config `trailingSlash: true`; without it the
// request 308-redirects, which sendBeacon will not follow.
const LOGOUT_URL = "/api/auth/logout/";

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

    return () => {
      clearTimeout(settle);
      window.removeEventListener("pagehide", onPageHide);
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
