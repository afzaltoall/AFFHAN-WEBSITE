"use client";

import { useEffect, useState } from "react";

/**
 * Which way the trip banner's lock stands, for the console's rail: a
 * "Locked" / "Open" pill beside its row, and a dot on the icon when the rail
 * is collapsed (the owner's request of 2026-10-06: the unlock reachable from
 * the admin itself, wherever one is in it).
 *
 * One reading per page, shared by every mark that asks, and kept in step with
 * the key: TripLockPanel announces each reading and each change it makes
 * (announceTripLock), so the rail turns "Open" the moment the key turns.
 */

const EVENT = "affhan:trip-lock";
let known: boolean | null = null;
let reading: Promise<void> | null = null;

/** The panel's word on the lock: the rail's marks show it at once. */
export function announceTripLock(locked: boolean) {
  known = locked;
  window.dispatchEvent(new CustomEvent<boolean>(EVENT, { detail: locked }));
}

function read() {
  reading ??= fetch("/api/admin/trip-lock/", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { locked?: unknown } | null) => {
      if (j && typeof j.locked === "boolean") announceTripLock(j.locked);
    })
    .catch(() => {
      /* unread: the marks stay hidden rather than guess */
    })
    .finally(() => {
      reading = null;
    });
  return reading;
}

/** true locked, false open, null not read (yet, or at all). */
function useTripLockKnown(): boolean | null {
  const [locked, setLocked] = useState<boolean | null>(known);
  useEffect(() => {
    const on = (e: Event) => setLocked((e as CustomEvent<boolean>).detail);
    window.addEventListener(EVENT, on);
    if (known === null) void read();
    else setLocked(known);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return locked;
}

/** The pill beside the row's label; it folds away with the label when the rail collapses (`open`). */
export function TripLockRailPill({ open, dark = false }: { open: boolean; dark?: boolean }) {
  const locked = useTripLockKnown();
  if (locked === null) return null;
  const tone = locked
    ? dark ? "bg-amber-400/15 text-amber-300" : "bg-amber-500/15 text-amber-800"
    : dark ? "bg-emerald-400/15 text-emerald-300" : "bg-emerald-500/12 text-emerald-700";
  return (
    <span
      className={`shrink-0 overflow-hidden whitespace-nowrap rounded-full text-[10.5px] font-bold leading-5 transition-[max-width,opacity,padding] duration-300 ease-out motion-reduce:transition-none ${tone} ${
        open ? "ml-1 max-w-[80px] px-2 opacity-100" : "ml-0 max-w-0 px-0 opacity-0"
      }`}
    >
      {locked ? "Locked" : "Open"}
    </span>
  );
}

/** The dot on the icon, for the collapsed rail, where the pill has no room: amber locked, green open. */
export function TripLockRailDot({ open }: { open: boolean }) {
  const locked = useTripLockKnown();
  if (locked === null) return null;
  return (
    <span
      aria-hidden="true"
      className={`absolute -right-0.5 -top-0.5 size-2.5 rounded-full transition-opacity duration-200 motion-reduce:transition-none ${locked ? "bg-amber-500" : "bg-emerald-500"} ${open ? "opacity-0" : "opacity-100"}`}
    />
  );
}
