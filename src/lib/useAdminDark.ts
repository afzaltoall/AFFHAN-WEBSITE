"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The admin's light/dark choice, remembered and shared.
 *
 * Each console screen used to keep its own `useState(false)`: dark on the
 * dashboard was light again on Suppliers, and light again on every reload. With
 * a shared rail down the side of every admin page that stopped being a quirk
 * and became a visible seam — a dark page beside a light rail — so the choice
 * now lives in one place, persists, and follows every screen that offers it
 * (in this tab at once, in other tabs through the storage event).
 *
 * Storage can be blocked (a private window, strict site settings); then the
 * choice is held in memory and lasts until the page is left, as it always did.
 */
const KEY = "affhan:admin-dark";
const EVENT = "affhan:admin-dark";

let storageWorks = true;
let memory = false;

function read(): boolean {
  if (!storageWorks) return memory;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    storageWorks = false;
    return memory;
  }
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) onChange(); };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAdminDark(): [boolean, (next: boolean | ((current: boolean) => boolean)) => void] {
  // The server always renders light; the stored choice applies once the page
  // is running, exactly as the per-page state did.
  const dark = useSyncExternalStore(subscribe, read, () => false);

  const setDark = useCallback((next: boolean | ((current: boolean) => boolean)) => {
    const value = typeof next === "function" ? next(read()) : next;
    memory = value;
    try {
      window.localStorage.setItem(KEY, value ? "1" : "0");
    } catch {
      storageWorks = false;
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [dark, setDark];
}
