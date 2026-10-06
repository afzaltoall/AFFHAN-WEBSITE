"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock, X } from "lucide-react";
import { TRIP_PREVIEW } from "./content";

/** sessionStorage: the admin hid the note for the rest of this tab's visit. */
const HIDDEN_KEY = "affhan:trip-preview-note";

/**
 * On each trip page, for an admin checking it while the trip is locked: a
 * small note under the navbar, on the right, that this is a preview (visitors
 * see "Opening soon"), with the way to the lock. Under the navbar because the
 * pages keep their own bars along the foot (the application's, the legal
 * pages').
 *
 * It asks /api/trip-lock/ once. A trip page showing at all while the trip is
 * locked is being seen by an admin, whom the door lets through (proxy.ts):
 * nobody else is ever shown this. Its × hides it for the rest of the visit.
 */
export function TripPreviewNote() {
  const [show, setShow] = useState(false);
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

  if (!show) return null;
  return (
    <aside
      aria-label={`${TRIP_PREVIEW.label}: ${TRIP_PREVIEW.line}`}
      className="fixed right-3 top-[calc(4rem+10px)] z-[210] flex max-w-[calc(100vw-24px)] items-center gap-2 rounded-full border border-[rgb(214_168_78/0.45)] bg-[rgb(12_10_14/0.9)] py-1 pl-3 pr-1 text-[12px] text-[#f4efe6] shadow-[0_14px_34px_-14px_rgb(0_0_0/0.85)] backdrop-blur-md"
    >
      <Lock size={13} strokeWidth={2.2} aria-hidden className="shrink-0 text-[#f2d38e]" />
      <span className="font-bold uppercase tracking-[0.18em] text-[#f2d38e]">{TRIP_PREVIEW.label}</span>
      <span className="truncate text-[rgb(244_239_230/0.78)]">{TRIP_PREVIEW.line}</span>
      <Link
        href={TRIP_PREVIEW.manage.href}
        className="shrink-0 rounded-full px-2 py-1 font-semibold text-[#f2d38e] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4efe6]"
      >
        {TRIP_PREVIEW.manage.label}
      </Link>
      <button
        type="button"
        aria-label={TRIP_PREVIEW.hide}
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
    </aside>
  );
}
