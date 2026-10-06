"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { flagUrl } from "@/lib/countries";
import type { ParticipantRow } from "@/lib/trip-participants";
import { REGISTERED } from "./content";

/** "Just now", "4 min ago", "3 h ago", "Yesterday", "6 days ago". */
export function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 45) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

const FLAP = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

/**
 * A Trip ID as a departures board shows a new line: its characters flap
 * through the board's alphabet and settle, left to right. Only when the row
 * has just arrived; the text is the real ID throughout for screen readers.
 */
function Flap({ text, play }: { text: string; play: boolean }) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (!play || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(text);
      return;
    }
    let frame = 0;
    const id = window.setInterval(() => {
      frame++;
      setShown(
        text
          .split("")
          .map((c, i) => (c === "-" || frame > 4 + i * 1.4 ? c : FLAP[(frame * 7 + i * 13) % FLAP.length]))
          .join(""),
      );
      if (frame > 4 + text.length * 1.4) window.clearInterval(id);
    }, 42);
    return () => window.clearInterval(id);
  }, [text, play]);
  return (
    <span aria-label={text}>
      <span aria-hidden>{shown}</span>
    </span>
  );
}

/**
 * The newest registrations, as an airport departures board: Trip ID, where
 * from, when, and "Registered". The visitor's own line is gold and says
 * "You". Lines that arrive while the page is open flip in at the top.
 * Anonymous by design (lib/trip-participants.ts).
 */
export function DepartureBoard({ rows, loaded, failed }: { rows: ParticipantRow[]; loaded: boolean; failed: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Which lines are new since the page opened (the first load is not "new").
  // Before the browser paints them, so a new line never shows unflipped first.
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  useLayoutEffect(() => {
    if (!loaded) return;
    const before = seen.current;
    if (before) setFresh(new Set(rows.filter((r) => !before.has(r.ref)).map((r) => r.ref)));
    seen.current = new Set([...(before ?? []), ...rows.map((r) => r.ref)]);
  }, [rows, loaded]);

  return (
    <section className="tr-board" aria-labelledby="tr-board-title">
      <div className="tr-board-head">
        <h2 id="tr-board-title" className="tr-panel-title">
          {REGISTERED.board.title}
        </h2>
        <span className="tr-live">
          <span aria-hidden className="tr-live-dot" />
          {REGISTERED.live.tag}
        </span>
      </div>
      <div className="tr-board-cols" aria-hidden>
        {REGISTERED.board.cols.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <ol className="tr-board-rows" aria-live="polite" aria-relevant="additions">
        {!loaded &&
          Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="tr-row tr-row-skeleton" aria-hidden>
              <span />
              <span />
              <span />
              <span />
            </li>
          ))}
        {loaded && rows.length === 0 && <li className="tr-board-empty">{REGISTERED.board.empty}</li>}
        {loaded &&
          rows.map((r, i) => {
            const isNew = fresh.has(r.ref);
            return (
              <li
                key={r.ref}
                className={`tr-row ${r.you ? "tr-row-you" : ""} ${isNew ? "tr-row-new" : ""}`}
                style={{ ["--i" as string]: Math.min(i, 12) }}
              >
                <span className="tr-row-id">
                  <Flap text={r.ref} play={isNew} />
                  {r.you && <span className="tr-row-you-tag">{REGISTERED.board.you}</span>}
                </span>
                <span className="tr-row-from">
                  {r.iso && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={flagUrl(r.iso)} alt="" width={20} height={14} loading="lazy" className="tr-flag" />
                  )}
                  <span className="truncate">{r.country}</span>
                </span>
                <span className="tr-row-when">
                  <time dateTime={r.at}>{ago(r.at, now)}</time>
                </span>
                <span className="tr-row-status">
                  <Check size={13} strokeWidth={2.6} aria-hidden />
                  {REGISTERED.board.status}
                </span>
              </li>
            );
          })}
      </ol>
      {failed && <p className="tr-board-error">{REGISTERED.board.error}</p>}
      <p className="tr-board-privacy">{REGISTERED.board.privacy}</p>
    </section>
  );
}
