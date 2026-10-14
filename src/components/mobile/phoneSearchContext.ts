import { useSyncExternalStore } from "react";

/**
 * What the phone frame's search box says while a category's own page is open (PhoneCategoryPage): its name, as
 * Alibaba's box says "laptops" on its Laptops page (the owner, 2026-10-14); null elsewhere, where the box turns
 * through its hints. The page sets it and clears it as it goes; the frame (PhoneChrome) reads it.
 */
let current: string | null = null;
const listeners = new Set<() => void>();

export function setPhoneSearchContext(name: string | null) {
  if (current === name) return;
  current = name;
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function usePhoneSearchContext(): string | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
