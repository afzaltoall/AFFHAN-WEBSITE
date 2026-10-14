import { useSyncExternalStore } from "react";

/** Below 768px: the width the phone frame takes over (lib/phoneChrome.ts). */
export const PHONE_QUERY = "(max-width: 767.98px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * Whether the screen is a phone's. While a page the server drew is being hydrated, false, as the server
 * (which cannot know the width) drew it, and the real answer straight after; on a page drawn in the browser
 * (a move within the site), the real answer from the first render, so a phone never builds what only a
 * computer shows.
 */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}
