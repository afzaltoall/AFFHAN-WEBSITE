"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Keep a server-rendered screen current without anybody pressing anything.
 *
 * The staff workspace and the console's side pages render their data on the
 * server. That made them correct at the moment they loaded and increasingly
 * wrong after it: a lead assigned from /admin did not appear for the employee
 * until they reloaded, and a reload was also the thing that used to sign people
 * out. This re-reads the page in place — router.refresh(), inside a transition
 * so the old screen stays up until the new one is ready and nothing a reader
 * has typed or opened is thrown away.
 *
 * Only while the tab is visible: a background tab refreshing itself every half
 * minute is load on the database for nobody. Coming back to a tab that has been
 * away for a while refreshes it straight away, since that is exactly when it is
 * most likely to be stale.
 */
export function useLiveRefresh(intervalMs = 30_000) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [updatedAt, setUpdatedAt] = useState(() => Date.now());
  const wasRefreshing = useRef(false);
  const lastStarted = useRef(0);

  const refresh = useCallback(() => {
    lastStarted.current = Date.now();
    startTransition(() => router.refresh());
  }, [router]);

  // A refresh has landed when the transition goes quiet.
  useEffect(() => {
    if (wasRefreshing.current && !refreshing) setUpdatedAt(Date.now());
    wasRefreshing.current = refreshing;
  }, [refreshing]);

  useEffect(() => {
    // The page was rendered fresh a moment ago; that counts as a refresh.
    lastStarted.current = Date.now();
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastStarted.current > 10_000) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, refresh]);

  return { refresh, refreshing, updatedAt };
}
