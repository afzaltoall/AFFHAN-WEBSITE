"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock, X } from "lucide-react";
import { TRIP_PREVIEW } from "./content";

/** sessionStorage: the admin hid the note for the rest of this tab's visit. */
const HIDDEN_KEY = "affhan:trip-preview-note";
/** How long it says it all before it folds to its lock. */
const OPEN_MS = 4500;

/**
 * On each trip page, for an admin checking it while the trip is locked: a
 * small note under the navbar, on the right, that this is a preview (visitors
 * see "Opening soon"), with the way to the lock. Under the navbar because the
 * pages keep their own bars along the foot (the application's, the legal
 * pages').
 *
 * It says it all for a few seconds, then folds to its lock alone, so it does
 * not sit over the page being checked (the owner's screenshots of
 * 2026-10-07: over the countdown, then the board); a pointer on it, the
 * keyboard in it, or a tap on the lock opens it again. Its × hides it for the
 * rest of the visit.
 *
 * It asks /api/trip-lock/ once. A trip page showing at all while the trip is
 * locked is being seen by an admin, whom the door lets through (proxy.ts):
 * nobody else is ever shown this.
 */
export function TripPreviewNote() {
  const [show, setShow] = useState(false);
  const [folded, setFolded] = useState(false);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(HIDDEN_KEY)) return;
    } catch {
      /* no storage: it simply shows */
    }
    let live = true;
    fetch("/api/trip-lock/")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { locked?: unknown } | null) => {
        if (live && j?.locked === true) setShow(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  // Open, it folds again a few seconds after it was last opened.
  useEffect(() => {
    if (!show || folded) return;
    const t = window.setTimeout(() => setFolded(true), OPEN_MS);
    return () => window.clearTimeout(t);
  }, [show, folded]);

  if (!show) return null;
  const open = !folded || held;
  return (
    <aside
      aria-label={`${TRIP_PREVIEW.label}: ${TRIP_PREVIEW.line}`}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setHeld(false)}
      className={`fixed right-3 top-[calc(4rem+10px)] z-[210] flex items-center rounded-full border border-[rgb(214_168_78/0.45)] bg-[rgb(12_10_14/0.9)] py-1 text-[12px] text-[#f4efe6] shadow-[0_14px_34px_-14px_rgb(0_0_0/0.85)] backdrop-blur-md transition-[padding] duration-300 ${open ? "pl-3 pr-1" : "px-1"}`}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? TRIP_PREVIEW.label : `${TRIP_PREVIEW.label}: ${TRIP_PREVIEW.line}`}
        onClick={() => {
          setFolded(false);
          setHeld(false);
        }}
        className={`grid shrink-0 place-items-center rounded-full text-[#f2d38e] transition-[width,height] duration-300 focus-visible:outline-2 focus-visible:outline-[#f4efe6] ${open ? "h-7 w-4" : "h-7 w-7"}`}
      >
        <Lock size={13} strokeWidth={2.2} aria-hidden />
      </button>
      <span
        aria-hidden={!open}
        className={`flex items-center gap-2 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ${open ? "max-w-[24rem] opacity-100" : "max-w-0 opacity-0"}`}
      >
        <span className="pl-1 font-bold uppercase tracking-[0.18em] text-[#f2d38e]">{TRIP_PREVIEW.label}</span>
        <span className="text-[rgb(244_239_230/0.78)]">{TRIP_PREVIEW.line}</span>
        <Link
          href={TRIP_PREVIEW.manage.href}
          tabIndex={open ? undefined : -1}
          className="shrink-0 rounded-full px-2 py-1 font-semibold text-[#f2d38e] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4efe6]"
        >
          {TRIP_PREVIEW.manage.label}
        </Link>
        <button
          type="button"
          aria-label={TRIP_PREVIEW.hide}
          tabIndex={open ? undefined : -1}
          onClick={() => {
            setShow(false);
            try {
              sessionStorage.setItem(HIDDEN_KEY, "1");
            } catch {
              /* no storage: hidden until the next page */
            }
          }}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[rgb(244_239_230/0.7)] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-[#f4efe6]"
        >
          <X size={14} aria-hidden />
        </button>
      </span>
    </aside>
  );
}
